// Auto-derive the server host from the browser's current location.
// This eliminates hardcoded IPs — works on any machine without changing this file.
const _host = window.location.hostname

export const server_api_config = {
    ip: _host,
    port: "5184",
}

export const server_websocket_config = {
    ip: _host,
    telemetryPort: 8440,
    mapPort: 8441,
    healthPort: 8442,
}
