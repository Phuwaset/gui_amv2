using MongoDB.Driver;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Linq;

// ===== Program.cs (Minimal API) =====
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader()
              .WithExposedHeaders("Content-Disposition");
    });
});

builder.Services.AddOpenApi();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://your-auth-provider.com"; // Replace with your Auth provider if you later switch to real JWTs
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateAudience = false
        };
    });
builder.Services.AddAuthorization();

// JSON case-insensitive (mapSites / mapName / etc.)
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
});

// Repositories
builder.Services.AddSingleton<IUserRepository, MongoUserRepository>();
builder.Services.AddSingleton<IMapRepository, MongoMapRepository>();
builder.Services.AddSingleton<ISettingsRepository, MongoSettingsRepository>();
builder.Services.AddSingleton<IRoutineRepository, MongoRoutineRepository>();

builder.WebHost.ConfigureKestrel(options =>
{
    // HTTP only
    options.ListenAnyIP(5184);
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowAll");
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

var secretKey = "your_secret_key"; // Replace with a strong secret key

// ===== Utils =====
string EncryptPassword(string password)
{
    using var sha256 = System.Security.Cryptography.SHA256.Create();
    var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password + secretKey));
    return Convert.ToBase64String(hashedBytes);
}
string GenerateToken() => Guid.NewGuid().ToString();
string GenerateSecureCode() => new Random().Next(100000, 999999).ToString();

// Helper: get user via Authorization: Bearer <token>
static async Task<UserModel?> GetUserFromAuthorizationAsync(HttpContext ctx, IUserRepository userRepo)
{
    var authHeader = ctx.Request.Headers["Authorization"].ToString();
    if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        return null;

    var token = authHeader.Substring("Bearer ".Length).Trim();
    if (string.IsNullOrWhiteSpace(token)) return null;

    return await userRepo.GetUserByTokenAsync(token);
}

// ===== AUTH ENDPOINTS =====

app.MapGet("/api/auth/admin-status", async (IUserRepository repo) =>
{
    var allUsers = await repo.GetAllUsersAsync();
    bool hasAdmin = allUsers.Any(u => u.role == "admin");
    return Results.Ok(new { hasAdmin });
});

app.MapPost("/api/auth/register", async (UserModel user, IUserRepository repo, ILogger<Program> logger) =>
{
    logger.LogInformation("Registering new user: {username}", user.username);

    if (await repo.GetUserByUsernameAsync(user.username) != null)
        return Results.BadRequest(new { Message = "username already exists", error = "failed" });

    var allUsers = await repo.GetAllUsersAsync();
    bool hasAdmin = allUsers.Any(u => u.role == "admin");

    if (hasAdmin)
    {
        if (user.role == "admin")
        {
            // This should not happen if the frontend is working correctly, but as a security measure, we block it.
            return Results.BadRequest(new { Message = "Cannot register as admin. An administrator already exists.", error = "failed" });
        }

        if (user.role != "operator" && user.role != "viewer")
        {
            // If the role is something else, or empty, default to viewer.
            user.role = "viewer";
        }
    }
    else
    {
        // No admin exists. The user can only register as admin.
        user.role = "admin";
    }

    user.password = EncryptPassword(user.password);
    user.token = GenerateToken();
    await repo.SaveUserAsync(user);

    return Results.Ok(new { Message = "User registered successfully", token = user.token, role = user.role });
});

app.MapPost("/api/auth/secure/code", async (UserModel user, IUserRepository repo, ILogger<Program> logger) =>
{
    var storedUser = await repo.GetUserByUsernameAsync(user.username);
    if (storedUser == null) return Results.Unauthorized();
    if (storedUser.securecode == null)
    {
        storedUser.securecode = GenerateSecureCode();
        await repo.UpdateUserAsync(storedUser);
    }
    
    return Results.Ok(new { Message = "Secure code generated", securecode = storedUser.securecode });
});

app.MapPost("/api/auth/login", async (UserModel user, IUserRepository repo, HttpContext httpContext, ILogger<Program> logger) =>
{
    var storedUser = await repo.GetUserByUsernameAsync(user.username);
    if (storedUser == null || storedUser.securecode == null)
        return Results.Ok(new { Message = "Invalid username or password", error = "failed" });

    if (storedUser.password != EncryptPassword(user.password))
        return Results.Ok(new { Message = "Invalid username or password", error = "failed" });

    if (storedUser.isBanned)
        return Results.Ok(new { Message = "You are banned by administrator. If you want to know why, ask him.", error = "banned" });

    if (!storedUser.isVerified)
        return Results.Ok(new { Message = "Please complete security verification", error = "unverified", token = storedUser.token });

    return Results.Ok(new { Message = "Login successful", token = storedUser.token });
});

app.MapPost("/api/auth/test_bind", (UserModel user) => 
{
    return Results.Ok(new { parsed_username = user.username, parsed_code = user.securecode });
});

app.MapPost("/api/auth/verify", async (UserModel user, IUserRepository repo, ILogger<Program> logger) =>
{
    var storedUser = await repo.GetUserByUsernameAsync(user.username);
    if (storedUser == null) return Results.Unauthorized();

    logger.LogInformation("Verify attempt for {user}: stored={stored}, provided={provided}", user.username, storedUser.securecode, user.securecode);

    if (storedUser.securecode != null && storedUser.securecode == user.securecode)
    {
        storedUser.isVerified = true;
        await repo.UpdateUserAsync(storedUser);
        return Results.Ok(new { Message = "Verification successful" });
    }

    return Results.Ok(new { Message = "Invalid security code", error = "failed" });
});

app.MapPost("/api/auth/forget", async (ForgetPasswordModel model, IUserRepository repo, ILogger<Program> logger) =>
{
    var storedUser = await repo.GetUserByUsernameAsync(model.username);
    if (storedUser != null && storedUser.securecode == model.securecode)
    {
        storedUser.password = EncryptPassword(model.newpassword);
        await repo.UpdateUserAsync(storedUser);
        return Results.Ok(new { Message = "password updated successfully", success = "true" });
    }

    return Results.Ok(new { Message = "Invalid secure code for user", error = "failed" });
});

app.MapPost("/api/auth/profile", async (HttpContext httpContext, IUserRepository repo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(httpContext, repo);
    if (user == null) return Results.Ok(new { Message = "Authorization header is missing or invalid", error = "failed" });

    return Results.Ok(new
    {
        username = user.username,
        displayName = user.displayName,
        role = user.role,
        isBanned = user.isBanned,
        createdAt = user.createdAt,
        SelectedMapSite = user.selectedMapSite,
        SelectedMapName = user.selectedMapName,
        avatarPath = user.avatarPath
    });
});

// ===== Update own profile (display name) =====
app.MapPatch("/api/user/profile", async (HttpContext ctx, UpdateProfileRequest req, IUserRepository repo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();

    await repo.UpdateProfileAsync(user.username, req.displayName?.Trim());
    logger.LogInformation("User {u} updated profile displayName={dn}", user.username, req.displayName);
    return Results.Ok(new { Message = "Profile updated" });
});

// ===== Change own password =====
app.MapPatch("/api/user/security", async (HttpContext ctx, ChangePasswordRequest req, IUserRepository repo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(req.currentPassword) || string.IsNullOrWhiteSpace(req.newPassword))
        return Results.BadRequest(new { Message = "currentPassword and newPassword are required", error = "failed" });

    if (user.password != EncryptPassword(req.currentPassword))
        return Results.Ok(new { Message = "Current password is incorrect", error = "failed" });

    await repo.UpdatePasswordAsync(user.username, EncryptPassword(req.newPassword));
    logger.LogInformation("User {u} changed password", user.username);
    return Results.Ok(new { Message = "Password updated successfully" });
});

// ===== Upload own avatar =====
app.MapPost("/api/user/avatar", async (HttpContext ctx, IUserRepository repo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();

    if (!ctx.Request.HasFormContentType)
        return Results.BadRequest(new { Message = "Expected multipart/form-data", error = "failed" });

    var form = await ctx.Request.ReadFormAsync();
    var file = form.Files.GetFile("avatar");
    if (file == null || file.Length == 0)
        return Results.BadRequest(new { Message = "No file provided", error = "failed" });

    // Max 500 KB
    if (file.Length > 512_000)
        return Results.BadRequest(new { Message = "File too large (max 500 KB)", error = "failed" });

    // Validate magic bytes: PNG (89 50 4E 47) or JPEG (FF D8 FF)
    using var stream = file.OpenReadStream();
    var magic = new byte[4];
    if (await stream.ReadAsync(magic.AsMemory(0, 4)) < 4)
        return Results.BadRequest(new { Message = "Invalid file", error = "failed" });

    bool isPng  = magic[0] == 0x89 && magic[1] == 0x50 && magic[2] == 0x4E && magic[3] == 0x47;
    bool isJpeg = magic[0] == 0xFF && magic[1] == 0xD8 && magic[2] == 0xFF;
    if (!isPng && !isJpeg)
        return Results.BadRequest(new { Message = "Only PNG and JPEG images are allowed", error = "failed" });

    string ext = isPng ? ".png" : ".jpg";

    // Sanitize username for filesystem: allow only a-z A-Z 0-9 _ -
    var safeUsername = System.Text.RegularExpressions.Regex.Replace(user.username, @"[^a-zA-Z0-9_\-]", "");
    if (string.IsNullOrEmpty(safeUsername)) safeUsername = "user";

    // Ensure avatars directory exists inside the app base path
    var avatarsDir = Path.Combine(AppContext.BaseDirectory, "avatars");
    Directory.CreateDirectory(avatarsDir);

    // Build safe destination path — verify it stays inside avatarsDir
    var fileName = safeUsername + ext;
    var destPath = Path.GetFullPath(Path.Combine(avatarsDir, fileName));
    if (!destPath.StartsWith(avatarsDir + Path.DirectorySeparatorChar) &&
        destPath != avatarsDir)
        return Results.BadRequest(new { Message = "Invalid path", error = "failed" });

    // Write file (reset stream to beginning first)
    stream.Seek(0, SeekOrigin.Begin);
    await using (var dest = new FileStream(destPath, FileMode.Create, FileAccess.Write))
        await stream.CopyToAsync(dest);

    // Store relative path in DB
    var relPath = Path.Combine("avatars", fileName);
    await repo.SetAvatarPathAsync(user.username, relPath);

    logger.LogInformation("User {u} uploaded avatar -> {p}", user.username, relPath);
    return Results.Ok(new { Message = "Avatar uploaded", avatarPath = relPath });
});

// ===== Serve avatar image (public) =====
app.MapGet("/api/user/avatar/{username}", async (string username, IUserRepository repo) =>
{
    // Sanitize username to prevent path traversal
    var safeUsername = System.Text.RegularExpressions.Regex.Replace(username, @"[^a-zA-Z0-9_\-]", "");
    if (string.IsNullOrEmpty(safeUsername)) return Results.NotFound();

    var avatarsDir = Path.Combine(AppContext.BaseDirectory, "avatars");

    // Try PNG then JPEG
    foreach (var ext in new[] { ".png", ".jpg" })
    {
        var filePath = Path.GetFullPath(Path.Combine(avatarsDir, safeUsername + ext));
        // Verify the resolved path stays inside avatarsDir
        if (!filePath.StartsWith(avatarsDir + Path.DirectorySeparatorChar)) continue;
        if (!File.Exists(filePath)) continue;

        var mime = ext == ".png" ? "image/png" : "image/jpeg";
        var bytes = await File.ReadAllBytesAsync(filePath);
        return Results.File(bytes, mime);
    }

    return Results.NotFound();
});

// ===== Upload system robot image =====
app.MapPost("/api/system/robot-image", async (HttpContext ctx, IUserRepository repo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();

    if (!ctx.Request.HasFormContentType)
        return Results.BadRequest(new { Message = "Expected multipart/form-data", error = "failed" });

    var form = await ctx.Request.ReadFormAsync();
    var file = form.Files.GetFile("robotImage");
    if (file == null || file.Length == 0)
        return Results.BadRequest(new { Message = "No file provided", error = "failed" });

    // Max 200 KB (generous for 128×128 PNG)
    if (file.Length > 204_800)
        return Results.BadRequest(new { Message = "File too large (max 200 KB)", error = "failed" });

    using var stream = file.OpenReadStream();

    // Validate PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    var header = new byte[24];
    if (await stream.ReadAsync(header.AsMemory(0, 24)) < 24)
        return Results.BadRequest(new { Message = "Invalid PNG file", error = "failed" });

    bool isPng = header[0] == 0x89 && header[1] == 0x50 &&
                 header[2] == 0x4E && header[3] == 0x47;
    if (!isPng)
        return Results.BadRequest(new { Message = "Only PNG images are allowed", error = "failed" });

    // Parse PNG IHDR for dimensions: width at bytes 16-19, height at bytes 20-23
    int width  = (header[16] << 24) | (header[17] << 16) | (header[18] << 8) | header[19];
    int height = (header[20] << 24) | (header[21] << 16) | (header[22] << 8) | header[23];
    if (width > 128 || height > 128 || width <= 0 || height <= 0)
        return Results.BadRequest(new { Message = $"Image must be at most 128×128 px (got {width}×{height})", error = "failed" });

    var robotImgDir = Path.Combine(AppContext.BaseDirectory, "robot_images");
    Directory.CreateDirectory(robotImgDir);

    var destPath = Path.GetFullPath(Path.Combine(robotImgDir, "robot.png"));
    if (!destPath.StartsWith(robotImgDir + Path.DirectorySeparatorChar) && destPath != robotImgDir + Path.DirectorySeparatorChar + "robot.png")
        return Results.BadRequest(new { Message = "Invalid path", error = "failed" });

    stream.Seek(0, SeekOrigin.Begin);
    await using (var dest = new FileStream(destPath, FileMode.Create, FileAccess.Write))
        await stream.CopyToAsync(dest);

    logger.LogInformation("User {u} uploaded robot image ({w}x{h})", user.username, width, height);
    return Results.Ok(new { Message = "Robot image uploaded", width, height });
});

// ===== Serve system robot image (public) =====
app.MapGet("/api/system/robot-image", async () =>
{
    var robotImgDir = Path.Combine(AppContext.BaseDirectory, "robot_images");
    var filePath = Path.GetFullPath(Path.Combine(robotImgDir, "robot.png"));
    if (!filePath.StartsWith(robotImgDir)) return Results.NotFound();
    if (!File.Exists(filePath)) return Results.NotFound();
    var bytes = await File.ReadAllBytesAsync(filePath);
    return Results.File(bytes, "image/png");
});

app.MapDelete("/api/system/robot-image", async (HttpContext ctx, IUserRepository repo) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();
    if (user.role != "admin") return Results.Forbid();

    var robotImgDir = Path.Combine(AppContext.BaseDirectory, "robot_images");
    var filePath = Path.GetFullPath(Path.Combine(robotImgDir, "robot.png"));
    if (!filePath.StartsWith(robotImgDir)) return Results.BadRequest();
    if (File.Exists(filePath)) File.Delete(filePath);
    return Results.Ok();
});

// ===== Admin: list all users =====
app.MapGet("/api/admin/users", async (HttpContext ctx, IUserRepository repo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();
    if (user.role != "admin") return Results.Forbid();

    var users = await repo.GetAllUsersAsync();
    return Results.Ok(users.Select(u => new {
        username = u.username,
        displayName = u.displayName,
        role = u.role,
        isBanned = u.isBanned,
        createdAt = u.createdAt
    }));
});

// ===== Admin: update user role =====
app.MapPatch("/api/admin/user/role", async (HttpContext ctx, AdminRoleRequest req, IUserRepository repo, ILogger<Program> logger) =>
{
    var admin = await GetUserFromAuthorizationAsync(ctx, repo);
    if (admin == null) return Results.Unauthorized();
    if (admin.role != "admin") return Results.Forbid();

    var validRoles = new[] { "admin", "operator", "viewer" };
    if (!validRoles.Contains(req.role))
        return Results.BadRequest(new { Message = "Invalid role. Must be admin, operator, or viewer", error = "failed" });

    await repo.UpdateRoleAsync(req.username, req.role);
    logger.LogInformation("Admin {a} set role={r} for user {u}", admin.username, req.role, req.username);
    return Results.Ok(new { Message = "Role updated", username = req.username, role = req.role });
});

// ===== Admin: ban / unban user =====
app.MapPatch("/api/admin/user/ban", async (HttpContext ctx, AdminBanRequest req, IUserRepository repo, ILogger<Program> logger) =>
{
    var admin = await GetUserFromAuthorizationAsync(ctx, repo);
    if (admin == null) return Results.Unauthorized();
    if (admin.role != "admin") return Results.Forbid();

    await repo.UpdateBanAsync(req.username, req.isBanned);
    var action = req.isBanned ? "banned" : "unbanned";
    logger.LogInformation("Admin {a} {action} user {u}", admin.username, action, req.username);
    return Results.Ok(new { Message = $"User {action}", username = req.username, isBanned = req.isBanned });
});

// ===== System Settings: get =====
app.MapGet("/api/settings", async (HttpContext ctx, IUserRepository repo, ISettingsRepository settingsRepo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();

    var settings = await settingsRepo.GetAsync();
    return Results.Ok(settings);
});

// ===== System Settings: update =====
app.MapPatch("/api/settings", async (HttpContext ctx, SystemSettings req, IUserRepository repo, ISettingsRepository settingsRepo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();
    if (user.role != "admin") return Results.Forbid();

    await settingsRepo.UpsertAsync(req);
    logger.LogInformation("Settings updated by {u}", user.username);
    return Results.Ok(new { Message = "Settings saved" });
});

// ===== Apply topic config: write configuration.yaml + trigger ROS reload =====
app.MapPost("/api/settings/apply-topics", async (HttpContext ctx, IUserRepository repo, ISettingsRepository settingsRepo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();
    if (user.role != "admin") return Results.Forbid();

    var settings = await settingsRepo.GetAsync();
    var tc = settings.topicConfig;

    // Build YAML content
    var yaml = $@"# RERIS topic configuration — auto-generated by reris_ui Settings page.
# All nodes reload this file when /reris/reload_topics receives a message.

topics:
  map: {tc.mapTopic}
  odom: {tc.odomTopic}
  plan: {tc.planTopic}
  planner_info: {tc.plannerInfoTopic}
  selected_map_paths: {tc.selectedMapPathsTopic}
  cmd_vel: {tc.cmdVelTopic}
  pose_with_action_array: {tc.poseWithActionArrayTopic}
  planner_current_goal: {tc.plannerCurrentGoalTopic}
  routines_plan: {tc.routinesPlanTopic}
";

    // Resolve destination path
    string configPath;
    var envOverride = Environment.GetEnvironmentVariable("RERIS_CONFIG_FILE");
    if (!string.IsNullOrWhiteSpace(envOverride))
    {
        configPath = envOverride;
    }
    else
    {
        // Try each prefix in AMENT_PREFIX_PATH for the reris_controller share dir
        var amentPrefixPath = Environment.GetEnvironmentVariable("AMENT_PREFIX_PATH") ?? "";
        configPath = "";
        foreach (var prefix in amentPrefixPath.Split(':', StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(prefix, "share", "reris_controller", "config", "configuration.yaml");
            if (File.Exists(candidate)) { configPath = candidate; break; }
        }
        // Fallback: source-tree path relative to AppContext.BaseDirectory
        if (string.IsNullOrWhiteSpace(configPath))
        {
            configPath = Path.GetFullPath(
                Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..",
                    "src", "reris_controller", "config", "configuration.yaml"));
        }
    }

    try
    {
        Directory.CreateDirectory(Path.GetDirectoryName(configPath)!);
        await File.WriteAllTextAsync(configPath, yaml);
        logger.LogInformation("Wrote topic config to {path}", configPath);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to write configuration.yaml");
        return Results.Problem($"Failed to write configuration.yaml: {ex.Message}");
    }

    // Trigger reload on all ROS nodes via ros2 topic pub
    try
    {
        // Use full path so the command works even when PATH doesn't include ROS 2 bin
        var ros2Bin = "/opt/ros/humble/bin/ros2";
        if (!File.Exists(ros2Bin)) ros2Bin = "ros2"; // fallback to PATH
        using var proc = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = ros2Bin,
            Arguments = "topic pub --once /reris/config/reload std_msgs/msg/Bool \"{data: true}\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        });
        if (proc != null) await proc.WaitForExitAsync();
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "ros2 topic pub reload failed (non-fatal)");
    }

    return Results.Ok(new { Message = "Topics applied and nodes signalled to reload" });
});

// ===== Select map for user profile (protected) =====
app.MapPatch("/api/user/select-map", async (HttpContext ctx, SelectMapRequest req, IUserRepository repo, ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, repo);
    if (user == null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(req.mapSite) || string.IsNullOrWhiteSpace(req.mapName))
        return Results.BadRequest(new { Message = "mapSite and mapName are required", error = "failed" });

    await repo.SetSelectedMapAsync(user.username, req.mapSite.Trim(), req.mapName.Trim());

    logger.LogInformation("User {u} selected map {site}/{name}", user.username, req.mapSite, req.mapName);
    return Results.Ok(new { Message = "Selected map saved" });
});

// ===== MAP ENDPOINTS (Manual Auth) =====

// Create/Append Map (protected) - mapAuthor from token's username
app.MapPost("/api/map/create", async (
    HttpContext ctx,
    MapCreateRequest req,
    IMapRepository mapRepo,
    IUserRepository userRepo,
    ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    // ต้องมี site และ map[] อย่างน้อย 1 รายการ
    if (req?.map_sites == null ||
        string.IsNullOrWhiteSpace(req.map_sites.mapSites) ||
        req.map_sites.map == null ||
        req.map_sites.map.Count == 0)
    {
        return Results.BadRequest(new { Message = "Invalid payload: map_sites.mapSites and map[] are required", error = "failed" });
    }

    var site = req.map_sites.mapSites.Trim();
    var input = req.map_sites.map[0];

    var newMap = new MapInfo
    {
        mapName   = input.mapName?.Trim() ?? "",
        mapLocate = input.mapLocate?.Trim() ?? "",
        mapAuthor = user.username,         // บังคับจาก token
        mapStatus = input.mapStatus        // ฝั่ง client ส่งมาได้; ไม่ส่ง = 0 (default ในโมเดล)
    };

    try
    {
        // พยายาม append เข้าเอกสาร site+author ที่มีอยู่แล้ว
        var appended = await mapRepo.AppendMapAsync(site, user.username, newMap);
        if (!appended)
        {
            // ไม่พบเอกสาร site ของ author นี้ => สร้างใหม่
            var doc = new MapDocument
            {
                map_sites = new MapSitesEnvelope
                {
                    mapSites = site,
                    map = new List<MapInfo> { newMap }
                },
                status = "Ready",
                createdAt = DateTime.UtcNow
            };

            await mapRepo.InsertAsync(doc);
            logger.LogInformation("Map created (new doc) by {user}: {site}/{name}", user.username, site, newMap.mapName);

            return Results.Ok(new
            {
                Message = "Map created successfully (new document)",
                id = doc.Id,
                map_sites = doc.map_sites,
                status = doc.status,
                createdAt = doc.createdAt
            });
        }
        else
        {
            logger.LogInformation("Map appended by {user}: {site}/{name}", user.username, site, newMap.mapName);
            return Results.Ok(new
            {
                Message = "Map appended to existing site",
                site = site,
                map = new
                {
                    map_name = newMap.mapName,
                    map_status = newMap.mapStatus,
                    locate = newMap.mapLocate,
                    author = newMap.mapAuthor
                }
            });
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Create/append map failed");
        return Results.BadRequest(new { Message = "Create/append map failed", error = "failed" });
    }
});


// Map list (protected) - returns only current user's maps (group by site)
app.MapGet("/api/map/list", async (
    HttpContext ctx,
    IMapRepository mapRepo,
    IUserRepository userRepo,
    ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    try
    {
        var items = await mapRepo.ListAsync();

        var result = items
            .Select(d => new
            {
                map_sites = new
                {
                    site_name = d.map_sites.mapSites,
                    map = d.map_sites.map
                        .Where(m => m.mapAuthor == user.username)
                        .Select(m => new
                        {
                            map_name        = m.mapName,
                            map_size        = "—",
                            status          = d.status,
                            map_status      = m.mapStatus,
                            locate          = m.mapLocate,
                            author          = m.mapAuthor,
                            map_description = m.mapDescription
                        })
                        .ToList()
                },
                id = d.Id,
                createdAt = d.createdAt
            })
            .Where(x => x.map_sites.map.Any()); // ตัด site ที่ไม่มีแมพของ user ออก

        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "List maps failed");
        return Results.BadRequest(new { Message = "List maps failed", error = "failed" });
    }
});

// Alias (protected) - same as /api/map/list
app.MapGet("/api/maps/list", async (
    HttpContext ctx,
    IMapRepository mapRepo,
    IUserRepository userRepo,
    ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    try
    {
        var items = await mapRepo.ListAsync();

        var result = items
            .Select(d => new
            {
                map_sites = new
                {
                    site_name = d.map_sites.mapSites,
                    map = d.map_sites.map
                        .Where(m => m.mapAuthor == user.username)
                        .Select(m => new
                        {
                            map_name        = m.mapName,
                            map_size        = "—",
                            status          = d.status,
                            map_status      = m.mapStatus,
                            locate          = m.mapLocate,
                            author          = m.mapAuthor,
                            map_description = m.mapDescription
                        })
                        .ToList()
                },
                id = d.Id,
                createdAt = d.createdAt
            })
            .Where(x => x.map_sites.map.Any());

        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "List maps failed");
        return Results.BadRequest(new { Message = "List maps failed", error = "failed" });
    }
});

// ==== Get map data (protected) - returns mapData json string for specific site and map ====
app.MapGet("/api/map/data", async (
    string site, string name,
    HttpContext ctx,
    IMapRepository mapRepo,
    IUserRepository userRepo,
    ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(site) || string.IsNullOrWhiteSpace(name))
        return Results.BadRequest(new { Message = "site and name are required", error = "failed" });

    try
    {
        var items = await mapRepo.ListAsync();
        var doc = items.FirstOrDefault(d => d.map_sites.mapSites == site);
        if (doc == null) return Results.NotFound(new { Message = "Site not found" });

        var map = doc.map_sites.map.FirstOrDefault(m => m.mapName == name && m.mapAuthor == user.username);
        if (map == null) return Results.NotFound(new { Message = "Map not found or unauthorized" });

        return Results.Ok(new { mapData = map.mapData });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Get map data failed");
        return Results.BadRequest(new { Message = "Get map data failed", error = "failed" });
    }
});

// ===== Update map status (protected) - PATCH endpoint =====
app.MapPatch("/api/map/update", async (
    HttpContext ctx,
    MapUpdateRequest req,
    IMapRepository mapRepo,
    IUserRepository userRepo,
    ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    var name = req?.mapName?.Trim();
    var site = req?.mapSite?.Trim();
    
    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(site))
        return Results.BadRequest(new { Message = "mapName and mapSite are required", error = "failed" });

    // At least one field must be provided for update
    if (!req.mapStatus.HasValue && string.IsNullOrWhiteSpace(req.mapLocate) && string.IsNullOrWhiteSpace(req.mapData)
        && string.IsNullOrWhiteSpace(req.newMapName) && string.IsNullOrWhiteSpace(req.mapDescription))
        return Results.BadRequest(new { Message = "At least one field must be provided", error = "failed" });

    var resolvedNewName = string.IsNullOrWhiteSpace(req.newMapName) ? null : req.newMapName.Trim();

    try
    {
        var updated = await mapRepo.UpdateMapAsync(site!, name!, user.username, req.mapStatus, req.mapLocate?.Trim(), req.mapData, resolvedNewName, req.mapDescription?.Trim());
        if (updated == 0)
        {
            logger.LogWarning("Update failed/not found for user {user} site {site} mapName {name}", user.username, site, name);
            return Results.NotFound(new { Message = "Map not found or you are not the author", error = "not_found" });
        }

        logger.LogInformation("Map updated by {user}: {site}/{name} newName={newName}", user.username, site, name, resolvedNewName);

        return Results.Ok(new
        {
            Message = "Map updated successfully",
            mapName = resolvedNewName ?? name,
            mapSite = site,
            mapStatus = req.mapStatus,
            updated
        });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Update map failed");
        return Results.BadRequest(new { Message = "Update map failed", error = "failed" });
    }
});

// ===== Remove a map (by name, author-only) from the array; not delete whole document =====
app.MapPost("/api/map/remove", async (
    HttpContext ctx,
    MapRemoveRequest req,
    IMapRepository mapRepo,
    IUserRepository userRepo,
    ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    var name = req?.mapName?.Trim();
    if (string.IsNullOrWhiteSpace(name))
        return Results.BadRequest(new { Message = "mapName is required", error = "failed" });

    try
    {
        var removed = await mapRepo.PullMapByNameForAuthorAsync(name!, user.username);
        if (removed == 0)
        {
            logger.LogWarning("Remove (pull) failed/not found for user {user} mapName {name}", user.username, name);
            return Results.NotFound(new { Message = "Map not found or you are not the author", error = "not_found" });
        }

        logger.LogInformation("Map removed (pulled from array) by {user}: {name}", user.username, name);
        return Results.Ok(new { Message = "Map removed from array", mapName = name, removed });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Remove map failed");
        return Results.BadRequest(new { Message = "Remove map failed", error = "failed" });
    }
});

// ===== ROUTINE ENDPOINTS =====

// List routines for current user (protected)
app.MapGet("/api/routine/list", async (
    HttpContext ctx,
    IRoutineRepository routineRepo,
    IUserRepository userRepo) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    var routines = await routineRepo.ListByAuthorAsync(user.username);
    return Results.Ok(routines);
});

// Upsert routine (protected)
app.MapPost("/api/routine/save", async (
    HttpContext ctx,
    RoutineModel routine,
    IRoutineRepository routineRepo,
    IUserRepository userRepo,
    ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(routine.routineId))
        return Results.BadRequest(new { Message = "routineId is required" });

    routine.author = user.username; // Ensure author matches token
    await routineRepo.UpsertAsync(routine);

    logger.LogInformation("Routine {id} saved by {user}", routine.routineId, user.username);
    return Results.Ok(new { Message = "Routine saved", routineId = routine.routineId });
});

// Delete routine (protected)
app.MapDelete("/api/routine/delete", async (
    [Microsoft.AspNetCore.Mvc.FromQuery] string routineId,
    HttpContext ctx,
    IRoutineRepository routineRepo,
    IUserRepository userRepo,
    ILogger<Program> logger) =>
{
    var user = await GetUserFromAuthorizationAsync(ctx, userRepo);
    if (user == null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(routineId))
        return Results.BadRequest(new { Message = "routineId query parameter is required" });

    logger.LogInformation("Attempting to delete routine {id} for user {user}", routineId, user.username);
    
    var success = await routineRepo.DeleteAsync(routineId, user.username);
    if (!success) 
    {
        logger.LogWarning("Delete failed: Routine {id} not found or unauthorized for {user}", routineId, user.username);
        return Results.NotFound(new { Message = "Routine not found or unauthorized" });
    }

    logger.LogInformation("Routine {id} deleted successfully by {user}", routineId, user.username);
    return Results.Ok(new { Message = "Routine deleted" });
});

// Get all routines (Public/Internal for Robot Polling)
app.MapGet("/api/routine/all", async (IRoutineRepository routineRepo) =>
{
    var routines = await routineRepo.GetAllAsync();
    return Results.Ok(routines);
});

app.Run();


// ===== Models and Repositories =====

// ----- Users -----
public record UserModel
{
    [BsonId]
    public ObjectId Id { get; set; }

    public string username { get; set; } = string.Empty;
    public string password { get; set; } = string.Empty;
    public string? token { get; set; }
    public string? securecode { get; set; }
    public bool isVerified { get; set; } = false;

    [BsonElement("selectedMapSite")]
    public string? selectedMapSite { get; set; }

    [BsonElement("selectedMapName")]
    public string? selectedMapName { get; set; }

    // --- Profile & Role fields ---
    [BsonElement("displayName")]
    public string? displayName { get; set; }

    [BsonElement("role")]
    public string role { get; set; } = "viewer"; // admin | operator | viewer

    [BsonElement("isBanned")]
    public bool isBanned { get; set; } = false;

    [BsonElement("createdAt")]
    public DateTime createdAt { get; set; } = DateTime.UtcNow;

    [BsonElement("avatarPath")]
    public string? avatarPath { get; set; }
}

public record ForgetPasswordModel
{
    public string username { get; set; } = string.Empty;
    public string newpassword { get; set; } = string.Empty;
    public string securecode { get; set; } = string.Empty;
}

public interface IUserRepository
{
    Task SaveUserAsync(UserModel user);
    Task<UserModel?> GetUserByUsernameAsync(string username);
    Task<UserModel?> GetUserByTokenAsync(string token);
    Task<UserModel?> CheckUserSecurityCode(string securityCode);
    Task UpdateUserAsync(UserModel user);
    Task SetSelectedMapAsync(string username, string mapSite, string mapName);
    // Profile & Admin
    Task<List<UserModel>> GetAllUsersAsync();
    Task UpdateProfileAsync(string username, string? displayName);
    Task UpdatePasswordAsync(string username, string encryptedPassword);
    Task UpdateRoleAsync(string username, string role);
    Task UpdateBanAsync(string username, bool isBanned);
    Task SetAvatarPathAsync(string username, string avatarPath);
}

public class MongoUserRepository : IUserRepository
{
    private readonly IMongoCollection<UserModel> _users;

    public MongoUserRepository()
    {
        var client = new MongoClient("mongodb://127.0.0.1:27017");
        var database = client.GetDatabase("UserDatabase");
        _users = database.GetCollection<UserModel>("Users");
    }

    public async Task SaveUserAsync(UserModel user)
    {
        await _users.InsertOneAsync(user);
    }

    public async Task<UserModel?> GetUserByUsernameAsync(string username)
    {
        return await _users.Find(u => u.username == username).FirstOrDefaultAsync();
    }

    public async Task<UserModel?> GetUserByTokenAsync(string token)
    {
        return await _users.Find(u => u.token == token).FirstOrDefaultAsync();
    }

    public async Task<UserModel?> CheckUserSecurityCode(string securityCode)
    {
        return await _users.Find(u => u.securecode == securityCode).FirstOrDefaultAsync();
    }

    public async Task UpdateUserAsync(UserModel user)
    {
        await _users.ReplaceOneAsync(u => u.username == user.username, user);
    }

    public async Task SetSelectedMapAsync(string username, string mapSite, string mapName)
    {
        var filter = Builders<UserModel>.Filter.Eq(u => u.username, username);
        var update = Builders<UserModel>.Update
            .Set(u => u.selectedMapSite, mapSite)
            .Set(u => u.selectedMapName, mapName);
        await _users.UpdateOneAsync(filter, update);
    }

    public async Task<List<UserModel>> GetAllUsersAsync()
    {
        var sort = Builders<UserModel>.Sort.Ascending(u => u.createdAt);
        return await _users.Find(Builders<UserModel>.Filter.Empty).Sort(sort).ToListAsync();
    }

    public async Task UpdateProfileAsync(string username, string? displayName)
    {
        var filter = Builders<UserModel>.Filter.Eq(u => u.username, username);
        var update = Builders<UserModel>.Update.Set(u => u.displayName, displayName);
        await _users.UpdateOneAsync(filter, update);
    }

    public async Task UpdatePasswordAsync(string username, string encryptedPassword)
    {
        var filter = Builders<UserModel>.Filter.Eq(u => u.username, username);
        var update = Builders<UserModel>.Update.Set(u => u.password, encryptedPassword);
        await _users.UpdateOneAsync(filter, update);
    }

    public async Task UpdateRoleAsync(string username, string role)
    {
        var filter = Builders<UserModel>.Filter.Eq(u => u.username, username);
        var update = Builders<UserModel>.Update.Set(u => u.role, role);
        await _users.UpdateOneAsync(filter, update);
    }

    public async Task UpdateBanAsync(string username, bool isBanned)
    {
        var filter = Builders<UserModel>.Filter.Eq(u => u.username, username);
        var update = Builders<UserModel>.Update.Set(u => u.isBanned, isBanned);
        await _users.UpdateOneAsync(filter, update);
    }

    public async Task SetAvatarPathAsync(string username, string avatarPath)
    {
        var filter = Builders<UserModel>.Filter.Eq(u => u.username, username);
        var update = Builders<UserModel>.Update.Set(u => u.avatarPath, avatarPath);
        await _users.UpdateOneAsync(filter, update);
    }
}

// ----- Request/Response Models for Profile & Settings -----

public record UpdateProfileRequest
{
    public string? displayName { get; set; }
}

public record ChangePasswordRequest
{
    public string currentPassword { get; set; } = string.Empty;
    public string newPassword { get; set; } = string.Empty;
}

public record AdminRoleRequest
{
    public string username { get; set; } = string.Empty;
    public string role { get; set; } = string.Empty; // admin | operator | viewer
}

public record AdminBanRequest
{
    public string username { get; set; } = string.Empty;
    public bool isBanned { get; set; }
}

// ----- System Settings -----

public record SystemSettings
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    // Map Configuration
    [BsonElement("defaultMapSite")]
    public string? defaultMapSite { get; set; }

    [BsonElement("defaultMapName")]
    public string? defaultMapName { get; set; }

    [BsonElement("mapResolution")]
    public double mapResolution { get; set; } = 0.05;

    [BsonElement("showGrid")]
    public bool showGrid { get; set; } = true;

    // Connections
    [BsonElement("apiEndpoint")]
    public string apiEndpoint { get; set; } = "http://localhost:5184";

    [BsonElement("wsEndpoint")]
    public string wsEndpoint { get; set; } = "ws://localhost:8441";

    [BsonElement("mongodbUri")]
    public string mongodbUri { get; set; } = "mongodb://127.0.0.1:27017";

    // Security
    [BsonElement("corsOrigins")]
    public List<string> corsOrigins { get; set; } = new() { "*" };

    [BsonElement("jwtExpiryHours")]
    public int jwtExpiryHours { get; set; } = 24;

    // IP Bans
    [BsonElement("bannedIps")]
    public List<string> bannedIps { get; set; } = new();

    // ROS 2 Topic Configuration
    [BsonElement("topicConfig")]
    public TopicConfig topicConfig { get; set; } = new();

    // Map Engine Visual Configuration
    [BsonElement("mapEngineConfig")]
    public MapEngineConfig mapEngineConfig { get; set; } = new();

    [BsonElement("updatedAt")]
    public DateTime updatedAt { get; set; } = DateTime.UtcNow;
}

public class MapEngineLayerVisibility
{
    [BsonElement("map")]     public bool map { get; set; } = true;
    [BsonElement("robot")]   public bool robot { get; set; } = true;
    [BsonElement("target")]  public bool target { get; set; } = true;
    [BsonElement("navPath")] public bool navPath { get; set; } = true;
}

public class MapEngineConfig
{
    [BsonElement("minZoom")]          public double minZoom { get; set; } = 0.1;
    [BsonElement("maxZoom")]          public double maxZoom { get; set; } = 10.0;
    [BsonElement("layerVisibility")]  public MapEngineLayerVisibility layerVisibility { get; set; } = new();
    [BsonElement("robotColor")]       public string robotColor { get; set; } = "#00ff00";
    [BsonElement("robotRadius")]      public double robotRadius { get; set; } = 0.25;
    [BsonElement("navPathColor")]     public string navPathColor { get; set; } = "#4285F4";
    [BsonElement("navPathWidth")]     public int navPathWidth { get; set; } = 15;
    [BsonElement("lutFree")]          public int lutFree { get; set; } = 240;
    [BsonElement("lutOccupied")]      public int lutOccupied { get; set; } = 0;
    [BsonElement("lutUnknown")]       public int lutUnknown { get; set; } = 127;
}

public class TopicConfig
{
    // ── reris_engine (reris_webctl node) ──
    [BsonElement("mapTopic")]
    public string mapTopic { get; set; } = "/map";

    [BsonElement("odomTopic")]
    public string odomTopic { get; set; } = "/odom";

    [BsonElement("planTopic")]
    public string planTopic { get; set; } = "/plan";

    [BsonElement("plannerInfoTopic")]
    public string plannerInfoTopic { get; set; } = "/reris/planner/info";

    [BsonElement("selectedMapPathsTopic")]
    public string selectedMapPathsTopic { get; set; } = "/selected_map_paths";

    [BsonElement("cmdVelTopic")]
    public string cmdVelTopic { get; set; } = "/cmd_vel";

    [BsonElement("poseWithActionArrayTopic")]
    public string poseWithActionArrayTopic { get; set; } = "/pose_with_action_array";

    // ── reris_planner node ──
    [BsonElement("plannerCurrentGoalTopic")]
    public string plannerCurrentGoalTopic { get; set; } = "/reris/planner/current_goal";

    [BsonElement("routinesPlanTopic")]
    public string routinesPlanTopic { get; set; } = "/reris_planner/plan/routines";
}

public interface ISettingsRepository
{
    Task<SystemSettings> GetAsync();
    Task UpsertAsync(SystemSettings settings);
}

public class MongoSettingsRepository : ISettingsRepository
{
    private readonly IMongoCollection<SystemSettings> _col;

    public MongoSettingsRepository()
    {
        var client = new MongoClient("mongodb://127.0.0.1:27017");
        var db = client.GetDatabase("UserDatabase");
        _col = db.GetCollection<SystemSettings>("SystemSettings");
    }

    public async Task<SystemSettings> GetAsync()
    {
        var existing = await _col.Find(Builders<SystemSettings>.Filter.Empty).FirstOrDefaultAsync();
        return existing ?? new SystemSettings();
    }

    public async Task UpsertAsync(SystemSettings settings)
    {
        var existing = await _col.Find(Builders<SystemSettings>.Filter.Empty).FirstOrDefaultAsync();
        settings = settings with { updatedAt = DateTime.UtcNow };
        if (existing != null)
        {
            // Preserve the stored _id so MongoDB does not reject the replace
            settings = settings with { Id = existing.Id };
            var filter = Builders<SystemSettings>.Filter.Eq(s => s.Id, existing.Id);
            await _col.ReplaceOneAsync(filter, settings);
        }
        else
        {
            await _col.InsertOneAsync(settings);
        }
    }
}

// ----- Routine Planner -----

public record RoutineWaypointModel
{
    [BsonElement("x")] public double x { get; set; }
    [BsonElement("y")] public double y { get; set; }
    [BsonElement("z")] public double z { get; set; }
    [BsonElement("qx")] public double qx { get; set; }
    [BsonElement("qy")] public double qy { get; set; }
    [BsonElement("qz")] public double qz { get; set; }
    [BsonElement("qw")] public double qw { get; set; }
    [BsonElement("point_name")] public string? point_name { get; set; }
    [BsonElement("circle_error")] public double circle_error { get; set; }
    [BsonElement("yaw_error")] public double yaw_error { get; set; }
    [BsonElement("delay_ms")] public int delay_ms { get; set; }
    [BsonElement("point_behavior")] public string point_behavior { get; set; } = "delay";
    [BsonElement("pub_topic")] public string? pub_topic { get; set; }
    [BsonElement("val_in")] public int? val_in { get; set; }
    [BsonElement("val_passed")] public int? val_passed { get; set; }
    [BsonElement("val_failed")] public int? val_failed { get; set; }
}

public record RoutineModel
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    [BsonElement("routineId")]
    public string routineId { get; set; } = string.Empty;

    [BsonElement("name")]
    public string name { get; set; } = string.Empty;

    [BsonElement("author")]
    public string author { get; set; } = string.Empty;

    [BsonElement("loop")]
    public int loop { get; set; } = 1;

    [BsonElement("timeout_s")]
    public double timeout_s { get; set; } = 300;

    [BsonElement("startup")]
    public bool startup { get; set; } = false;

    [BsonElement("trigger_topic")]
    public string? trigger_topic { get; set; }

    [BsonElement("trigger_map")]
    public Dictionary<string, string>? trigger_map { get; set; }

    [BsonElement("waypoints")]
    public List<RoutineWaypointModel> waypoints { get; set; } = new();

    [BsonElement("updatedAt")]
    public DateTime updatedAt { get; set; } = DateTime.UtcNow;
}

public interface IRoutineRepository
{
    Task UpsertAsync(RoutineModel routine);
    Task<List<RoutineModel>> ListByAuthorAsync(string author);
    Task<List<RoutineModel>> GetAllAsync();
    Task<bool> DeleteAsync(string routineId, string author);
}

public class MongoRoutineRepository : IRoutineRepository
{
    private readonly IMongoCollection<RoutineModel> _routines;

    public MongoRoutineRepository()
    {
        var client = new MongoClient("mongodb://127.0.0.1:27017");
        var database = client.GetDatabase("UserDatabase");
        _routines = database.GetCollection<RoutineModel>("Routines");
    }

    public async Task UpsertAsync(RoutineModel routine)
    {
        routine.updatedAt = DateTime.UtcNow;
        var filter = Builders<RoutineModel>.Filter.Eq(r => r.routineId, routine.routineId);
        var options = new ReplaceOptions { IsUpsert = true };
        await _routines.ReplaceOneAsync(filter, routine, options);
    }

    public async Task<List<RoutineModel>> ListByAuthorAsync(string author)
    {
        return await _routines.Find(r => r.author == author).ToListAsync();
    }

    public async Task<List<RoutineModel>> GetAllAsync()
    {
        return await _routines.Find(Builders<RoutineModel>.Filter.Empty).ToListAsync();
    }

    public async Task<bool> DeleteAsync(string routineId, string author)
    {
        var res = await _routines.DeleteOneAsync(r => r.routineId == routineId && r.author == author);
        return res.DeletedCount > 0;
    }
}

public record MapCreateRequest
{
    [BsonElement("map_sites")]
    public MapSitesEnvelope? map_sites { get; set; }
}

public record MapUpdateRequest
{
    public string mapName { get; set; } = string.Empty;
    public string mapSite { get; set; } = string.Empty;
    public int? mapStatus { get; set; }
    public string? mapLocate { get; set; }
    public string? mapData { get; set; }
    public string? newMapName { get; set; }
    public string? mapDescription { get; set; }
}

public record MapRemoveRequest
{
    public string mapName { get; set; } = string.Empty;
}

public record SelectMapRequest
{
    public string mapSite { get; set; } = string.Empty;
    public string mapName { get; set; } = string.Empty;
}

public record MapSitesEnvelope
{
    [BsonElement("mapSites")]
    public string? mapSites { get; set; }

    // เปลี่ยนให้เป็นอาเรย์
    [BsonElement("map")]
    public List<MapInfo> map { get; set; } = new();
}

public record MapInfo
{
    [BsonElement("mapName")]
    public string mapName { get; set; } = string.Empty;

    [BsonElement("mapLocate")]
    public string mapLocate { get; set; } = string.Empty;

    [BsonElement("mapAuthor")]
    public string mapAuthor { get; set; } = string.Empty;

    // NEW: numeric status per-map
    [BsonElement("mapStatus")]
    public int mapStatus { get; set; } = 0;

    [BsonElement("mapData")]
    public string mapData { get; set; } = string.Empty;

    [BsonElement("mapDescription")]
    public string mapDescription { get; set; } = string.Empty;
}

public record MapDocument
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();

    [BsonElement("map_sites")]
    public MapSitesEnvelope map_sites { get; set; } = new();

    [BsonElement("createdAt")]
    public DateTime createdAt { get; set; } = DateTime.UtcNow;

    [BsonElement("status")]
    public string status { get; set; } = "Ready";
}

public interface IMapRepository
{
    Task InsertAsync(MapDocument doc);
    Task<List<MapDocument>> ListAsync();

    // append แผนที่เข้า array (ถ้าพบ site ของ author นั้น)
    Task<bool> AppendMapAsync(string site, string author, MapInfo map);

    // อัปเดต map fields ใน array ตามชื่อและ author
    Task<long> UpdateMapAsync(string site, string mapName, string author, int? mapStatus, string? mapLocate, string? mapData, string? newMapName = null, string? mapDescription = null);

    // ลบสมาชิกใน array ตามชื่อและ author
    Task<long> PullMapByNameForAuthorAsync(string mapName, string author);
}

public class MongoMapRepository : IMapRepository
{
    private readonly IMongoCollection<MapDocument> _maps;

    public MongoMapRepository()
    {
        var client = new MongoClient("mongodb://127.0.0.1:27017"); // edit connection string as needed
        var database = client.GetDatabase("UserDatabase");
        _maps = database.GetCollection<MapDocument>("Maps");
    }

    public async Task InsertAsync(MapDocument doc)
    {
        await _maps.InsertOneAsync(doc);
    }

    public async Task<List<MapDocument>> ListAsync()
    {
        var sort = Builders<MapDocument>.Sort.Descending(x => x.createdAt);
        return await _maps.Find(Builders<MapDocument>.Filter.Empty)
                          .Sort(sort)
                          .ToListAsync();
    }

    // ถ้ามีเอกสาร site+author ให้ push เข้า array
    public async Task<bool> AppendMapAsync(string site, string author, MapInfo map)
    {
        var f = Builders<MapDocument>.Filter;
        var filter =
            f.Eq(d => d.map_sites.mapSites, site) &
            f.ElemMatch(d => d.map_sites.map, m => m.mapAuthor == author);

        var update = Builders<MapDocument>.Update.Push(d => d.map_sites.map, map);
        var res = await _maps.UpdateOneAsync(filter, update);
        return res.ModifiedCount > 0;
    }

    // อัปเดต map fields ของสมาชิกใน array ที่ตรงกับ site + mapName + author
    public async Task<long> UpdateMapAsync(string site, string mapName, string author, int? mapStatus, string? mapLocate, string? mapData, string? newMapName = null, string? mapDescription = null)
    {
        var f = Builders<MapDocument>.Filter;
        var filter =
            f.Eq(d => d.map_sites.mapSites, site) &
            f.ElemMatch(d => d.map_sites.map, m => m.mapName == mapName && m.mapAuthor == author);

        var updateBuilder = Builders<MapDocument>.Update;
        var updates = new List<UpdateDefinition<MapDocument>>();

        if (mapStatus.HasValue)
            updates.Add(updateBuilder.Set("map_sites.map.$[elem].mapStatus", mapStatus.Value));

        if (!string.IsNullOrWhiteSpace(mapLocate))
            updates.Add(updateBuilder.Set("map_sites.map.$[elem].mapLocate", mapLocate));

        if (!string.IsNullOrWhiteSpace(mapData))
            updates.Add(updateBuilder.Set("map_sites.map.$[elem].mapData", mapData));

        if (!string.IsNullOrWhiteSpace(newMapName))
            updates.Add(updateBuilder.Set("map_sites.map.$[elem].mapName", newMapName));

        if (mapDescription != null)
            updates.Add(updateBuilder.Set("map_sites.map.$[elem].mapDescription", mapDescription));

        if (updates.Count == 0)
            return 0;

        var update = updateBuilder.Combine(updates);

        var arrayFilters = new List<ArrayFilterDefinition>
        {
            new BsonDocumentArrayFilterDefinition<BsonDocument>(
                new BsonDocument
                {
                    { "elem.mapName", mapName },
                    { "elem.mapAuthor", author }
                }
            )
        };

        var options = new UpdateOptions { ArrayFilters = arrayFilters };
        var res = await _maps.UpdateManyAsync(filter, update, options);
        return res.ModifiedCount;
    }

    // ลบสมาชิกใน array: mapName + author (ทุก site)
    public async Task<long> PullMapByNameForAuthorAsync(string mapName, string author)
    {
        var filter = Builders<MapDocument>.Filter.ElemMatch(
            d => d.map_sites.map,
            m => m.mapName == mapName && m.mapAuthor == author
        );

        var update = Builders<MapDocument>.Update.PullFilter(
            d => d.map_sites.map,
            Builders<MapInfo>.Filter.Where(m => m.mapName == mapName && m.mapAuthor == author)
        );

        var res = await _maps.UpdateManyAsync(filter, update);
        return res.ModifiedCount;
    }
}