<template>
  <aside
    class="ip-panel"
    :class="{ 'ip-panel--collapsed': isPanelCollapsed }"
    role="region"
    aria-label="Properties"
    v-show="!isPanelCollapsed"
  >
    <!-- Title bar -->
    <header
      class="ip-titlebar"
      role="button"
      tabindex="0"
      @click="togglePanel()"
      @keydown.enter.prevent.stop="togglePanel()"
      @keydown.space.prevent.stop="togglePanel()"
    >
      <div class="ip-titlebar__left">
        <svg class="ip-titlebar__chevron" :class="{ 'ip-titlebar__chevron--open': !isPanelCollapsed }" viewBox="0 0 10 10" fill="none">
          <path d="M3 2L7 5L3 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="ip-titlebar__title">Properties</span>
      </div>
      <span class="ip-titlebar__hint">{{ isPanelCollapsed ? 'Expand' : 'Collapse' }}</span>
    </header>

    <transition name="ip-slide">
      <div v-show="!isPanelCollapsed" class="ip-body" @click.stop>

        <!-- ── Selection summary ─────────────────────────────── -->
        <section class="ip-section ip-section--accent" v-if="hasMultiSelection">
          <div class="ip-section__hd ip-section__hd--static">
            <span class="ip-section__label">Selection</span>
            <span class="ip-chip ip-chip--blue">{{ selectionCount }}</span>
          </div>
          <div class="ip-section__bd" @click.stop>
            <div v-if="selectedMarkers.length" class="ip-sub-group">
              <div class="ip-sub-label">Markers ({{ selectedMarkers.length }})</div>
              <div v-for="m in selectedMarkers" :key="m.id ?? markerKey(m)" class="ip-sel-row">
                <span class="ip-sel-icon">
                  <svg viewBox="0 0 12 14" fill="none"><circle cx="6" cy="5" r="3" stroke="#60a5fa" stroke-width="1.2"/><path d="M6 8v5" stroke="#60a5fa" stroke-width="1.2" stroke-linecap="round"/></svg>
                </span>
                <span class="ip-sel-name">{{ m.label || m.id || 'marker' }}</span>
                <span class="ip-sel-pos">({{ (m.x ?? 0).toFixed(2) }}, {{ (m.y ?? 0).toFixed(2) }})</span>
              </div>
            </div>
            <div v-if="selectedAreas.length" class="ip-sub-group">
              <div class="ip-sub-label">Areas ({{ selectedAreas.length }})</div>
              <div v-for="r in selectedAreas" :key="r.id" class="ip-sel-row">
                <span class="ip-sel-icon ip-sel-icon--rect">▭</span>
                <span class="ip-sel-name">{{ r.label || r.id }}</span>
                <span class="ip-sel-tag" :class="r.type === 'restrict' ? 'ip-sel-tag--danger' : 'ip-sel-tag--nav'">
                  {{ r.type === 'restrict' ? 'Restrict' : 'Nav' }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Single Marker ─────────────────────────────────── -->
        <section class="ip-section" v-if="hasSingle">
          <div class="ip-section__hd" @click="toggleSection('single')" role="button" tabindex="0"
               @keydown.enter.prevent.stop="toggleSection('single')"
               @keydown.space.prevent.stop="toggleSection('single')">
            <svg class="ip-caret" :class="{ 'ip-caret--open': sectionStates.single }" viewBox="0 0 8 8" fill="none">
              <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <span class="ip-section__label">Single Marker</span>
          </div>

          <div v-show="sectionStates.single" class="ip-section__bd" @click.stop>
            <div class="ip-card" :class="{ 'ip-card--selected': isSelectedSingle }" @click="selectSingle()">
              <div class="ip-card__topbar">
                <span class="ip-card__name">{{ singleTitle }}</span>
                <button class="ip-icon-btn ip-icon-btn--danger" @click.stop="deleteSingle()" title="Delete">
                  <svg viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M4.5 3.5l.5 8h5l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
              <div class="ip-xyz-row">
                <label class="ip-xyz-cell">
                  <span class="ip-xyz-lbl">X</span>
                  <input class="ip-xyz-input"
                         :value="draftGet('single:x', (state?.singleGoal?.value.x ?? 0).toFixed(2))"
                         @focus="draftEnsure('single:x', (state?.singleGoal?.value.x ?? 0).toFixed(2))"
                         @input="e => draftSet('single:x', (e.target as HTMLInputElement).value)"
                         @keydown.enter.prevent="commitSingleDraft('x')"
                         @keydown.esc.prevent="draftRevert('single:x')"
                         @blur="commitSingleDraft('x')" />
                </label>
                <label class="ip-xyz-cell">
                  <span class="ip-xyz-lbl">Y</span>
                  <input class="ip-xyz-input"
                         :value="draftGet('single:y', (state?.singleGoal?.value.y ?? 0).toFixed(2))"
                         @focus="draftEnsure('single:y', (state?.singleGoal?.value.y ?? 0).toFixed(2))"
                         @input="e => draftSet('single:y', (e.target as HTMLInputElement).value)"
                         @keydown.enter.prevent="commitSingleDraft('y')"
                         @keydown.esc.prevent="draftRevert('single:y')"
                         @blur="commitSingleDraft('y')" />
                </label>
                <label class="ip-xyz-cell">
                  <span class="ip-xyz-lbl">°</span>
                  <input class="ip-xyz-input"
                         :value="draftGet('single:yawdeg', ((((state?.singleGoal?.value.yaw ?? 0) * 180.0) / Math.PI)).toFixed(1))"
                         @focus="draftEnsure('single:yawdeg', ((((state?.singleGoal?.value.yaw ?? 0) * 180.0) / Math.PI)).toFixed(1))"
                         @input="e => draftSet('single:yawdeg', (e.target as HTMLInputElement).value)"
                         @keydown.enter.prevent="commitSingleDraft('yaw')"
                         @keydown.esc.prevent="draftRevert('single:yawdeg')"
                         @blur="commitSingleDraft('yaw')" />
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Multi Markers ──────────────────────────────────── -->
        <section class="ip-section">
          <div class="ip-section__hd" @click="toggleSection('multi')" role="button" tabindex="0"
               @keydown.enter.prevent.stop="toggleSection('multi')"
               @keydown.space.prevent.stop="toggleSection('multi')">
            <svg class="ip-caret" :class="{ 'ip-caret--open': sectionStates.multi }" viewBox="0 0 8 8" fill="none">
              <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <span class="ip-section__label">Multi Markers</span>
            <span class="ip-chip">{{ visibleMultiMarkers?.length ?? 0 }}</span>
          </div>

          <div v-show="sectionStates.multi" class="ip-section__bd" @click.stop>
            <div v-if="(visibleMultiMarkers?.length ?? 0) === 0" class="ip-empty">No markers</div>

            <div v-for="(m, idx) in (visibleMultiMarkers || [])" :key="m.id ?? `multi_${idx}`"
                 class="ip-card"
                 :class="{
                   'ip-card--selected': isSelectedMulti(indexOfOriginal(m)),
                   'ip-card--executing': state?.nodeStatus?.value?.current_goal_idx === indexOfOriginal(m)
                 }"
                 @click="selectMulti(indexOfOriginal(m))">

              <div class="ip-card__topbar">
                <span class="ip-seq-num">{{ idx + 1 }}</span>
                <span v-if="state?.nodeStatus?.value?.current_goal_idx === indexOfOriginal(m)" class="ip-exec-tag">Executing</span>
                <span v-else class="ip-card__name">{{ m.label ?? `marker_${idx}` }}</span>
                <div class="ip-card__actions">
                  <button class="ip-icon-btn" @click.stop="reorderMultiOriginal(indexOfOriginal(m), -1)" :disabled="idx === 0" title="Move up">
                    <svg viewBox="0 0 10 10" fill="none"><path d="M2 7L5 3L8 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="ip-icon-btn" @click.stop="reorderMultiOriginal(indexOfOriginal(m), 1)" :disabled="idx === (visibleMultiMarkers?.length ?? 1) - 1" title="Move down">
                    <svg viewBox="0 0 10 10" fill="none"><path d="M2 3L5 7L8 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="ip-icon-btn" @click.stop="toggleColorPicker(`m:${markerKey(m)}`)" title="Color">
                    <span class="ip-color-dot" :style="{ background: m.color || '#9ca3af' }"></span>
                  </button>
                  <button class="ip-icon-btn ip-icon-btn--danger" @click.stop="deleteMulti(indexOfOriginal(m))" title="Delete">
                    <svg viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M4.5 3.5l.5 8h5l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </div>
              </div>

              <!-- Label -->
              <div class="ip-field-row" @click.stop>
                <span class="ip-field-lbl">Label</span>
                <input class="ip-field-input"
                       :value="draftGet(`m:${markerKey(m)}:label`, m.label ?? '')"
                       @focus="draftEnsure(`m:${markerKey(m)}:label`, m.label ?? '')"
                       @input="e => draftSet(`m:${markerKey(m)}:label`, (e.target as HTMLInputElement).value)"
                       @keydown.enter.prevent="commitMarkerDraft(m, 'label')"
                       @keydown.esc.prevent="draftRevert(`m:${markerKey(m)}:label`)"
                       @blur="commitMarkerDraft(m, 'label')"
                       placeholder="Label…" />
              </div>

              <!-- XYZ -->
              <div class="ip-xyz-row" @click.stop>
                <label class="ip-xyz-cell">
                  <span class="ip-xyz-lbl">X</span>
                  <input class="ip-xyz-input"
                         :value="draftGet(`m:${markerKey(m)}:x`, (m.x ?? 0).toFixed(2))"
                         @focus="draftEnsure(`m:${markerKey(m)}:x`, (m.x ?? 0).toFixed(2))"
                         @input="e => draftSet(`m:${markerKey(m)}:x`, (e.target as HTMLInputElement).value)"
                         @keydown.enter.prevent="commitMarkerDraft(m, 'x')"
                         @keydown.esc.prevent="draftRevert(`m:${markerKey(m)}:x`)"
                         @blur="commitMarkerDraft(m, 'x')" />
                </label>
                <label class="ip-xyz-cell">
                  <span class="ip-xyz-lbl">Y</span>
                  <input class="ip-xyz-input"
                         :value="draftGet(`m:${markerKey(m)}:y`, (m.y ?? 0).toFixed(2))"
                         @focus="draftEnsure(`m:${markerKey(m)}:y`, (m.y ?? 0).toFixed(2))"
                         @input="e => draftSet(`m:${markerKey(m)}:y`, (e.target as HTMLInputElement).value)"
                         @keydown.enter.prevent="commitMarkerDraft(m, 'y')"
                         @keydown.esc.prevent="draftRevert(`m:${markerKey(m)}:y`)"
                         @blur="commitMarkerDraft(m, 'y')" />
                </label>
                <label class="ip-xyz-cell">
                  <span class="ip-xyz-lbl">°</span>
                  <input class="ip-xyz-input"
                         :value="draftGet(`m:${markerKey(m)}:yawdeg`, (((m.yaw ?? 0) * 180.0) / Math.PI).toFixed(1))"
                         @focus="draftEnsure(`m:${markerKey(m)}:yawdeg`, (((m.yaw ?? 0) * 180.0) / Math.PI).toFixed(1))"
                         @input="e => draftSet(`m:${markerKey(m)}:yawdeg`, (e.target as HTMLInputElement).value)"
                         @keydown.enter.prevent="commitMarkerDraft(m, 'yaw')"
                         @keydown.esc.prevent="draftRevert(`m:${markerKey(m)}:yawdeg`)"
                         @blur="commitMarkerDraft(m, 'yaw')" />
                </label>
              </div>

              <!-- Action params -->
              <div class="ip-params" @click.stop>
                <div class="ip-param-row">
                  <span class="ip-param-lbl">Radius</span>
                  <input type="range" class="ip-slider" min="0.1" max="5.0" step="0.1"
                         :value="draftGet(`m:${markerKey(m)}:act_r`, getActionPart(m.action, 0, '0.5'))"
                         @input="e => { draftSet(`m:${markerKey(m)}:act_r`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                  <input type="number" class="ip-num" min="0.1" max="5.0" step="0.1"
                         :value="draftGet(`m:${markerKey(m)}:act_r`, getActionPart(m.action, 0, '0.5'))"
                         @change="e => { draftSet(`m:${markerKey(m)}:act_r`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                  <span class="ip-param-unit">m</span>
                </div>
                <div class="ip-param-row">
                  <span class="ip-param-lbl">Yaw err</span>
                  <input type="range" class="ip-slider" min="1" max="180" step="1"
                         :value="draftGet(`m:${markerKey(m)}:act_y`, getActionPart(m.action, 1, '1'))"
                         @input="e => { draftSet(`m:${markerKey(m)}:act_y`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                  <input type="number" class="ip-num" min="1" max="180" step="1"
                         :value="draftGet(`m:${markerKey(m)}:act_y`, getActionPart(m.action, 1, '1'))"
                         @change="e => { draftSet(`m:${markerKey(m)}:act_y`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                  <span class="ip-param-unit">°</span>
                </div>
                <div class="ip-param-row">
                  <span class="ip-param-lbl">Delay</span>
                  <input type="number" class="ip-num ip-num--wide" min="0" step="100"
                         :value="draftGet(`m:${markerKey(m)}:act_d`, getActionPart(m.action, 2, '1000'))"
                         @change="e => { draftSet(`m:${markerKey(m)}:act_d`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                  <span class="ip-param-unit">ms</span>
                </div>
              </div>

              <!-- Color picker -->
              <div v-if="activeColorPicker === `m:${markerKey(m)}`" class="ip-palette" @click.stop>
                <div v-for="c in colorPalette" :key="c"
                     class="ip-swatch" :style="{ background: c }"
                     :class="{ 'ip-swatch--active': m.color === c }"
                     @click.stop="updateMarkerColor(m, c)"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Areas ──────────────────────────────────────────── -->
        <section class="ip-section">
          <div class="ip-section__hd" @click="toggleSection('areas')" role="button" tabindex="0"
               @keydown.enter.prevent.stop="toggleSection('areas')"
               @keydown.space.prevent.stop="toggleSection('areas')">
            <svg class="ip-caret" :class="{ 'ip-caret--open': sectionStates.areas }" viewBox="0 0 8 8" fill="none">
              <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <span class="ip-section__label">Areas</span>
            <span class="ip-chip">{{ state?.areaRects?.value.length ?? 0 }}</span>
          </div>

          <div v-show="sectionStates.areas" class="ip-section__bd" @click.stop>
            <div v-if="(state?.areaRects?.value.length ?? 0) === 0" class="ip-empty">No areas</div>

            <div v-for="r in (state?.areaRects?.value ?? [])" :key="r.id"
                 class="ip-card ip-card--area"
                 :class="{ 'ip-card--selected': isSelectedRect(r.id) }"
                 @click="selectRect(r.id)">

              <div class="ip-card__topbar">
                <div class="ip-color-dot" :style="{ background: r.color }"></div>
                <input class="ip-inline-name"
                       :value="draftGet(`area:${r.id}:label`, r.label ?? r.id)"
                       @focus="draftEnsure(`area:${r.id}:label`, r.label ?? r.id)"
                       @input="e => draftSet(`area:${r.id}:label`, (e.target as HTMLInputElement).value)"
                       @keydown.enter.prevent="commitAreaDraft(r.id)"
                       @keydown.esc.prevent="draftRevert(`area:${r.id}:label`)"
                       @blur="commitAreaDraft(r.id)"
                       @click.stop
                       placeholder="Area name" />
                <div class="ip-card__actions">
                  <button class="ip-icon-btn" @click.stop="toggleColorPicker(`area:${r.id}`)" title="Color">
                    <svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="7" r="2" fill="currentColor"/></svg>
                  </button>
                  <button class="ip-icon-btn ip-icon-btn--danger" @click.stop="deleteRect(r.id)" title="Delete">
                    <svg viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M4.5 3.5l.5 8h5l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </div>
              </div>

              <div class="ip-meta">{{ fmtRect(r) }}</div>

              <!-- Type toggle -->
              <div class="ip-toggle-row" @click.stop>
                <button class="ip-toggle-btn" :class="{ 'ip-toggle-btn--nav': (!r.type || r.type === 'navigation') }"
                        @click.stop="updateAreaType(r.id, 'navigation')">Navigation</button>
                <button class="ip-toggle-btn" :class="{ 'ip-toggle-btn--restrict': r.type === 'restrict' }"
                        @click.stop="updateAreaType(r.id, 'restrict')">Restrict</button>
              </div>

              <!-- Color palette -->
              <div v-if="activeColorPicker === `area:${r.id}`" class="ip-palette" @click.stop>
                <div v-for="c in colorPalette" :key="c"
                     class="ip-swatch" :style="{ background: c }"
                     :class="{ 'ip-swatch--active': r.color === c }"
                     @click.stop="updateAreaColor(r.id, c)"></div>
              </div>

              <!-- In-area markers -->
              <div class="ip-dock" @click.stop>
                <div class="ip-dock__hd" @click.stop="toggleDock(r.id)" role="button" tabindex="0"
                     @keydown.enter.prevent.stop="toggleDock(r.id)">
                  <svg class="ip-caret ip-caret--sm" :class="{ 'ip-caret--open': dockStates[r.id] }" viewBox="0 0 8 8" fill="none">
                    <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  </svg>
                  <span class="ip-dock__label">In-area markers</span>
                  <span class="ip-chip ip-chip--sm">{{ r.dockPosition?.length ?? 0 }}</span>
                </div>

                <div v-show="dockStates[r.id]">
                  <div v-if="(r.dockPosition?.length ?? 0) === 0" class="ip-empty ip-empty--sm">None inside</div>

                  <ul v-else class="ip-dock__list">
                    <li v-for="(m, i) in r.dockPosition" :key="m.id ?? `${r.id}_mk_${i}`" class="ip-dock__item">
                      <div class="ip-dock__topbar">
                        <input class="ip-inline-name ip-inline-name--sm"
                               :value="draftGet(`m:${markerKey(m)}:label`, m.label ?? '')"
                               @focus="draftEnsure(`m:${markerKey(m)}:label`, m.label ?? '')"
                               @input="e => draftSet(`m:${markerKey(m)}:label`, (e.target as HTMLInputElement).value)"
                               @keydown.enter.prevent="commitMarkerDraft(m, 'label')"
                               @keydown.esc.prevent="draftRevert(`m:${markerKey(m)}:label`)"
                               @blur="commitMarkerDraft(m, 'label')"
                               placeholder="Label…" />
                        <button class="ip-icon-btn ip-icon-btn--sm" @click.stop="toggleColorPicker(`m:${markerKey(m)}`)" title="Color">
                          <span class="ip-color-dot" :style="{ background: m.color || '#9ca3af' }"></span>
                        </button>
                      </div>

                      <div v-if="activeColorPicker === `m:${markerKey(m)}`" class="ip-palette" @click.stop>
                        <div v-for="c in colorPalette" :key="c"
                             class="ip-swatch" :style="{ background: c }"
                             :class="{ 'ip-swatch--active': m.color === c }"
                             @click.stop="updateMarkerColor(m, c)"></div>
                      </div>

                      <div class="ip-params ip-params--sm" @click.stop>
                        <div class="ip-param-row">
                          <span class="ip-param-lbl">Radius</span>
                          <input type="range" class="ip-slider" min="0.1" max="5.0" step="0.1"
                                 :value="draftGet(`m:${markerKey(m)}:act_r`, getActionPart(m.action, 0, '0.5'))"
                                 @input="e => { draftSet(`m:${markerKey(m)}:act_r`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                          <input type="number" class="ip-num" min="0.1" max="5.0" step="0.1"
                                 :value="draftGet(`m:${markerKey(m)}:act_r`, getActionPart(m.action, 0, '0.5'))"
                                 @change="e => { draftSet(`m:${markerKey(m)}:act_r`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                          <span class="ip-param-unit">m</span>
                        </div>
                        <div class="ip-param-row">
                          <span class="ip-param-lbl">Yaw err</span>
                          <input type="range" class="ip-slider" min="1" max="180" step="1"
                                 :value="draftGet(`m:${markerKey(m)}:act_y`, getActionPart(m.action, 1, '1'))"
                                 @input="e => { draftSet(`m:${markerKey(m)}:act_y`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                          <input type="number" class="ip-num" min="1" max="180" step="1"
                                 :value="draftGet(`m:${markerKey(m)}:act_y`, getActionPart(m.action, 1, '1'))"
                                 @change="e => { draftSet(`m:${markerKey(m)}:act_y`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                          <span class="ip-param-unit">°</span>
                        </div>
                        <div class="ip-param-row">
                          <span class="ip-param-lbl">Delay</span>
                          <input type="number" class="ip-num ip-num--wide" min="0" step="100"
                                 :value="draftGet(`m:${markerKey(m)}:act_d`, getActionPart(m.action, 2, '1000'))"
                                 @change="e => { draftSet(`m:${markerKey(m)}:act_d`, (e.target as HTMLInputElement).value); commitActionDraft(m); }" />
                          <span class="ip-param-unit">ms</span>
                        </div>
                      </div>

                      <div class="ip-xyz-row" @click.stop>
                        <label class="ip-xyz-cell">
                          <span class="ip-xyz-lbl">X</span>
                          <input class="ip-xyz-input"
                                 :value="draftGet(`m:${markerKey(m)}:x`, (m.x ?? 0).toFixed(2))"
                                 @focus="draftEnsure(`m:${markerKey(m)}:x`, (m.x ?? 0).toFixed(2))"
                                 @input="e => draftSet(`m:${markerKey(m)}:x`, (e.target as HTMLInputElement).value)"
                                 @keydown.enter.prevent="commitMarkerDraft(m, 'x')"
                                 @keydown.esc.prevent="draftRevert(`m:${markerKey(m)}:x`)"
                                 @blur="commitMarkerDraft(m, 'x')" />
                        </label>
                        <label class="ip-xyz-cell">
                          <span class="ip-xyz-lbl">Y</span>
                          <input class="ip-xyz-input"
                                 :value="draftGet(`m:${markerKey(m)}:y`, (m.y ?? 0).toFixed(2))"
                                 @focus="draftEnsure(`m:${markerKey(m)}:y`, (m.y ?? 0).toFixed(2))"
                                 @input="e => draftSet(`m:${markerKey(m)}:y`, (e.target as HTMLInputElement).value)"
                                 @keydown.enter.prevent="commitMarkerDraft(m, 'y')"
                                 @keydown.esc.prevent="draftRevert(`m:${markerKey(m)}:y`)"
                                 @blur="commitMarkerDraft(m, 'y')" />
                        </label>
                        <label class="ip-xyz-cell">
                          <span class="ip-xyz-lbl">°</span>
                          <input class="ip-xyz-input"
                                 :value="draftGet(`m:${markerKey(m)}:yawdeg`, (((m.yaw ?? 0) * 180.0) / Math.PI).toFixed(1))"
                                 @focus="draftEnsure(`m:${markerKey(m)}:yawdeg`, (((m.yaw ?? 0) * 180.0) / Math.PI).toFixed(1))"
                                 @input="e => draftSet(`m:${markerKey(m)}:yawdeg`, (e.target as HTMLInputElement).value)"
                                 @keydown.enter.prevent="commitMarkerDraft(m, 'yaw')"
                                 @keydown.esc.prevent="draftRevert(`m:${markerKey(m)}:yawdeg`)"
                                 @blur="commitMarkerDraft(m, 'yaw')" />
                        </label>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Controls ───────────────────────────────────────── -->
        <section class="ip-section">
          <div class="ip-section__hd" @click="toggleSection('controls')" role="button" tabindex="0"
               @keydown.enter.prevent.stop="toggleSection('controls')"
               @keydown.space.prevent.stop="toggleSection('controls')">
            <svg class="ip-caret" :class="{ 'ip-caret--open': sectionStates.controls }" viewBox="0 0 8 8" fill="none">
              <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <span class="ip-section__label">Controls</span>
          </div>

          <div v-show="sectionStates.controls" class="ip-section__bd" @click.stop>
            <div class="ip-ctrl-grid">
              <button class="ip-ctrl-btn" @click="mapEngine?.zoomIn?.()" :disabled="zLevel >= maxZoom">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.4"/><path d="M7 5v4M5 7h4M11 11l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                Zoom In
              </button>
              <button class="ip-ctrl-btn" @click="mapEngine?.zoomOut?.()" :disabled="zLevel <= minZoom">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.4"/><path d="M5 7h4M11 11l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                Zoom Out
              </button>
              <button class="ip-ctrl-btn" @click="resetZoom">
                <svg viewBox="0 0 16 16" fill="none"><path d="M3 8a5 5 0 105.5-4.97M3 4v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Reset
              </button>
              <button class="ip-ctrl-btn" @click="exportToJson">
                <svg viewBox="0 0 16 16" fill="none"><path d="M4 13h8M8 3v7M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Export
              </button>
              <button class="ip-ctrl-btn" @click="emit('exportToMap', () => {})">
                <svg viewBox="0 0 16 16" fill="none"><path d="M3 13h10M8 3v7M5 10h6M5 3h4l3 3v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Save
              </button>
              <button class="ip-ctrl-btn ip-ctrl-btn--execute" @click="ExecuteGoal">
                <svg viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
                Execute
              </button>
              <button class="ip-ctrl-btn ip-ctrl-btn--cancel" @click="ExecuteCancelGoal">
                <svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                Cancel
              </button>
            </div>
          </div>
        </section>

        <!-- ── Footer info ────────────────────────────────────── -->
        <footer class="ip-footer" @click.stop>
          <div class="ip-info-row">
            <span class="ip-info-lbl">Zoom</span>
            <span class="ip-info-val">{{ Number(zLevel).toFixed(1) }}×</span>
          </div>
          <div class="ip-info-row" v-if="showPerformanceInfo">
            <span class="ip-info-lbl">FPS</span>
            <span class="ip-info-val">{{ currentFPS }}</span>
          </div>
          <div class="ip-info-row" v-if="state?.robotPosition?.value">
            <span class="ip-info-lbl">Robot</span>
            <span class="ip-info-val ip-info-val--mono">
              {{ state.robotPosition.value.x?.toFixed(2) ?? '0.00' }},
              {{ state.robotPosition.value.y?.toFixed(2) ?? '0.00' }},
              {{ (((state.robotPosition.value.yaw * 180.0) / Math.PI) - 90).toFixed(1) }}°
            </span>
          </div>
        </footer>

      </div>
    </transition>
  </aside>
</template>

<script lang="ts" setup>
import { computed, ref, reactive, watch } from 'vue';
import type { MapState } from '../state/mapState';
import type { IPosition } from 'src/interfaces/robot_interfaces';

type EngineWithZoom = { zoomIn: () => void; zoomOut: () => void; resetZoom?: () => void; };

const props = withDefaults(defineProps<{
  state?: MapState,
  mapEngine?: EngineWithZoom,
  zoomLevel?: number | { value: number },
  minZoom?: number,
  maxZoom?: number,
  showPerformanceInfo?: boolean,
  currentFPS?: number,
  isCollapsed?: boolean
}>(), {
  zoomLevel: 1,
  minZoom: 0.5,
  maxZoom: 3,
  showPerformanceInfo: false,
  currentFPS: 0,
  isCollapsed: true
});

const state = computed(() => props.state);
const mapEngine = computed(() => props.mapEngine);

const zLevel = computed<number>(() => {
  const zl: number = props.zoomLevel;
  if (typeof zl === 'number') return zl;
  if (zl && typeof zl.value === 'number') return zl.value;
  return 1;
});
const minZoom = computed<number>(() => Number.isFinite(props.minZoom) ? Number(props.minZoom) : 0.5);
const maxZoom = computed<number>(() => Number.isFinite(props.maxZoom) ? Number(props.maxZoom) : 3);
const showPerformanceInfo = computed<boolean>(() => !!props.showPerformanceInfo);
const currentFPS = computed<number>(() => Number.isFinite(props.currentFPS) ? Number(props.currentFPS) : 0);

const emit = defineEmits([
  "exportJson",
  "exportToMap",
  "ExecuteGoal",
  "ExecuteCancelGoal",
  "update:isCollapsed"
]);

const isPanelCollapsed = ref(props.isCollapsed);
const sectionStates = reactive({ single: true, multi: true, areas: true, controls: true });
const dockStates = reactive<Record<string, boolean>>({});

watch(() => props.isCollapsed, (v) => { isPanelCollapsed.value = v; });

function togglePanel(force?: boolean) {
  const newState = typeof force === 'boolean' ? force : !isPanelCollapsed.value;
  isPanelCollapsed.value = newState;
  emit('update:isCollapsed', newState);
}
function toggleSection(section: keyof typeof sectionStates) { sectionStates[section] = !sectionStates[section]; }
function toggleDock(id: string) { dockStates[id] = !dockStates[id]; }

const drafts = reactive<Record<string, string>>({});
function draftKeyForSingle(axis: 'x' | 'y' | 'yaw') { return axis === 'yaw' ? 'single:yawdeg' : `single:${axis}`; }
function markerKey(m: IPosition) {
  if (m?.id != null) return String(m.id);
  return `${Math.round((m?.x ?? 0) * 1e6)}:${Math.round((m?.y ?? 0) * 1e6)}`;
}
function draftGet(key: string, fallback: string) { return (key in drafts) ? drafts[key] : fallback; }
function draftEnsure(key: string, fallback: string) { if (!(key in drafts)) drafts[key] = fallback ?? ''; }
function draftSet(key: string, val: string) { drafts[key] = val; }
function draftRevert(key: string) { delete drafts[key]; }

function getActionPart(actionStr: string | undefined, index: number, fallback: string) {
  if (!actionStr) return fallback;
  const parts = actionStr.split(',');
  return (parts.length > index && parts[index] !== '') ? parts[index] : fallback;
}

function commitActionDraft(marker: IPosition) {
  const mk = markerKey(marker);
  const r = draftGet(`m:${mk}:act_r`, getActionPart(marker.action, 0, '0.5'));
  const y = draftGet(`m:${mk}:act_y`, getActionPart(marker.action, 1, '1'));
  const d = draftGet(`m:${mk}:act_d`, getActionPart(marker.action, 2, '1000'));
  updateMarkerActionSmart(marker, `${r},${y},${d}`);
  draftRevert(`m:${mk}:act_r`); draftRevert(`m:${mk}:act_y`); draftRevert(`m:${mk}:act_d`);
}

function commitSingleDraft(axis: 'x' | 'y' | 'yaw') {
  const key = draftKeyForSingle(axis);
  if (!(key in drafts)) return;
  const raw = drafts[key]; delete drafts[key];
  if (!state.value?.singleGoal) return;
  const num = parseFloat(raw);
  if (!Number.isFinite(num)) return;
  state.value.singleGoal.value = { ...state.value.singleGoal.value, [axis === 'yaw' ? 'yaw' : axis]: axis === 'yaw' ? (num * Math.PI) / 180 : num };
}

function commitMarkerDraft(marker: IPosition, field: 'label' | 'action' | 'x' | 'y' | 'yaw') {
  const mk = markerKey(marker);
  const isYaw = field === 'yaw';
  const key = isYaw ? `m:${mk}:yawdeg` : `m:${mk}:${field}`;
  if (!(key in drafts)) return;
  const raw = drafts[key]; delete drafts[key];
  if (field === 'label') { updateMarkerLabelSmart(marker, raw); return; }
  if (field === 'action') { updateMarkerActionSmart(marker, raw); return; }
  const num = parseFloat(raw);
  if (!Number.isFinite(num)) return;
  updateMarkerPositionSmart(marker, field, String(isYaw ? (num * Math.PI) / 180 : num));
}

function commitAreaDraft(id: string) {
  const key = `area:${id}:label`;
  if (!(key in drafts)) return;
  const val = drafts[key]; delete drafts[key];
  updateAreaLabel(id, val);
}

function getMarkerKey(m: IPosition) { return markerKey(m); }
const rectDockKeys = computed<Set<string>>(() => {
  const s = new Set<string>();
  if (!state.value?.areaRects?.value) return s;
  for (const r of state.value.areaRects.value)
    for (const m of (r.dockPosition ?? [])) s.add(getMarkerKey(m));
  return s;
});
const visibleMultiMarkers = computed<IPosition[]>(() => {
  const arr = state.value?.multiGoal?.value;
  if (!Array.isArray(arr)) return [];
  return arr.filter(m => !rectDockKeys.value.has(getMarkerKey(m)));
});
function indexOfOriginal(m: IPosition) {
  if (!state.value?.multiGoal?.value) return -1;
  const key = getMarkerKey(m);
  return state.value.multiGoal.value.findIndex(mm => getMarkerKey(mm) === key);
}

const hasSingle = computed(() => {
  if (!state.value?.singleGoal?.value) return false;
  return Number.isFinite(state.value.singleGoal.value.x) && Number.isFinite(state.value.singleGoal.value.y);
});
const singleTitle = computed(() => state.value?.singleGoal?.value?.id ?? 'single_goal');
const isSelectedSingle = computed(() => state.value?.selectedObject?.value?.type === 'single');
const isSelectedMulti = (i: number) => state.value?.selectedObject?.value?.type === 'multi' && state.value.selectedObject.value.index === i;
const isSelectedRect = (id: string) => (state.value?.selectedObject?.value?.type?.startsWith('rect') ?? false) && state.value?.selectedObject?.value?.id === id;

const hasMultiSelection = computed(() => {
  const sel = state.value?.multiSelection?.value;
  return (sel?.markerIndices?.length ?? 0) > 0 || (sel?.areaIds?.length ?? 0) > 0;
});
const selectionCount = computed(() => {
  const sel = state.value?.multiSelection?.value;
  return (sel?.markerIndices?.length ?? 0) + (sel?.areaIds?.length ?? 0);
});
const selectedMarkers = computed<IPosition[]>(() => {
  const sel = state.value?.multiSelection?.value;
  const arr = state.value?.multiGoal?.value;
  if (!sel || !arr) return [];
  return sel.markerIndices.map(i => arr[i]).filter(Boolean);
});
const selectedAreas = computed(() => {
  const sel = state.value?.multiSelection?.value;
  const rects = state.value?.areaRects?.value;
  if (!sel || !rects) return [];
  const ids = new Set(sel.areaIds);
  return rects.filter(r => ids.has(r.id));
});

function fmtXY(x: number, y: number) { return `(${Number(x).toFixed(2)}, ${Number(y).toFixed(2)})`; }
function fmtRect(r: { p1: { x: number; y: number }; p2: { x: number; y: number } }) {
  return `Center ${fmtXY((r.p1.x + r.p2.x) / 2, (r.p1.y + r.p2.y) / 2)}`;
}

function selectSingle() { if (state.value?.selectedObject) state.value.selectedObject.value = { type: 'single' }; }
function selectMulti(index: number) { if (state.value?.selectedObject) state.value.selectedObject.value = { type: 'multi', index }; }
function selectRect(id: string) { if (state.value?.selectedObject) state.value.selectedObject.value = { type: 'rect', id }; }

function deleteSingle() {
  if (!state.value?.singleGoal) return;
  state.value.singleGoal.value = { x: 0, y: 0, yaw: 0 } as IPosition;
  if (state.value.selectedObject.value?.type === 'single') state.value.selectedObject.value = null;
}
function deleteMulti(index: number) {
  if (!state.value?.multiGoal) return;
  const arr = [...state.value.multiGoal.value];
  if (index >= 0 && index < arr.length) arr.splice(index, 1);
  state.value.multiGoal.value = arr;
  if (isSelectedMulti(index)) state.value.selectedObject.value = null;
}
function reorderMultiOriginal(index: number, shift: number) {
  if (!state.value?.multiGoal) return;
  const arr = [...state.value.multiGoal.value];
  if (index < 0 || index >= arr.length) return;
  const newIndex = index + shift;
  if (newIndex < 0 || newIndex >= arr.length) return;
  const item = arr.splice(index, 1)[0];
  arr.splice(newIndex, 0, item);
  state.value.multiGoal.value = arr;
}
function deleteRect(id: string) {
  if (!state.value?.areaRects) return;
  state.value.areaRects.value = state.value.areaRects.value.filter(r => r.id !== id);
  if (isSelectedRect(id)) state.value.selectedObject.value = null;
}

function updateMarkerLabelSmart(marker: IPosition, label: string) {
  if (marker?.id != null) updateMarkerLabelById(marker.id, label);
  else { const idx = indexOfOriginal(marker); if (idx !== -1) updateMarkerLabelByIndex(idx, label, marker); }
}
function updateMarkerActionSmart(marker: IPosition, action: string) {
  if (marker?.id != null) updateMarkerActionById(marker.id, action);
  else { const idx = indexOfOriginal(marker); if (idx !== -1) updateMarkerActionByIndex(idx, action, marker); }
}
function updateMarkerPositionSmart(marker: IPosition, axis: 'x' | 'y' | 'yaw', value: string) {
  const num = parseFloat(value); if (isNaN(num)) return;
  const final = axis === 'yaw' ? (num * Math.PI / 180) : num;
  if (marker?.id != null) updateMarkerPositionById(marker.id, axis, final);
  else { const idx = indexOfOriginal(marker); if (idx !== -1) updateMarkerPositionByIndex(idx, axis, final, marker); }
}

function updateMarkerActionById(id: string | number, action: string) {
  if (!state.value?.multiGoal || !state.value?.areaRects) return;
  const idStr = String(id);
  const src = [...state.value.multiGoal.value];
  for (let i = 0; i < src.length; i++) if (String(src[i]?.id) === idStr) src[i] = { ...src[i], action };
  state.value.multiGoal.value = src;
  state.value.areaRects.value = state.value.areaRects.value.map(rect => ({
    ...rect, dockPosition: (rect.dockPosition ?? []).map(dm => String(dm?.id ?? '') === idStr ? { ...dm, action } : dm)
  }));
}
function updateMarkerLabelById(id: string | number, label: string) {
  if (!state.value?.multiGoal || !state.value?.areaRects) return;
  const idStr = String(id);
  const src = [...state.value.multiGoal.value];
  for (let i = 0; i < src.length; i++) if (String(src[i]?.id) === idStr) src[i] = { ...src[i], label };
  state.value.multiGoal.value = src;
  state.value.areaRects.value = state.value.areaRects.value.map(rect => ({
    ...rect, dockPosition: (rect.dockPosition ?? []).map(dm => String(dm?.id ?? '') === idStr ? { ...dm, label } : dm)
  }));
}
function updateMarkerPositionById(id: string | number, axis: 'x' | 'y' | 'yaw', value: number) {
  if (!state.value?.multiGoal || !state.value?.areaRects) return;
  const idStr = String(id);
  const src = [...state.value.multiGoal.value];
  for (let i = 0; i < src.length; i++) if (String(src[i]?.id) === idStr) src[i] = { ...src[i], [axis]: value };
  state.value.multiGoal.value = src;
  state.value.areaRects.value = state.value.areaRects.value.map(rect => ({
    ...rect, dockPosition: (rect.dockPosition ?? []).map(dm => String(dm?.id ?? '') === idStr ? { ...dm, [axis]: value } : dm)
  }));
}
function updateMarkerLabelByIndex(index: number, label: string, markerRef?: IPosition) {
  if (!state.value?.multiGoal || !state.value?.areaRects || index < 0) return;
  const src = [...state.value.multiGoal.value]; src[index] = { ...src[index], label };
  state.value.multiGoal.value = src;
  const key = getMarkerKey(markerRef ?? src[index]);
  state.value.areaRects.value = state.value.areaRects.value.map(rect => ({
    ...rect, dockPosition: (rect.dockPosition ?? []).map(dm => getMarkerKey(dm) === key ? { ...dm, label } : dm)
  }));
}
function updateMarkerActionByIndex(index: number, action: string, markerRef?: IPosition) {
  if (!state.value?.multiGoal || !state.value?.areaRects || index < 0) return;
  const src = [...state.value.multiGoal.value]; src[index] = { ...src[index], action };
  state.value.multiGoal.value = src;
  const key = getMarkerKey(markerRef ?? src[index]);
  state.value.areaRects.value = state.value.areaRects.value.map(rect => ({
    ...rect, dockPosition: (rect.dockPosition ?? []).map(dm => getMarkerKey(dm) === key ? { ...dm, action } : dm)
  }));
}
function updateMarkerPositionByIndex(index: number, axis: 'x' | 'y' | 'yaw', value: number, markerRef?: IPosition) {
  if (!state.value?.multiGoal || !state.value?.areaRects || index < 0) return;
  const src = [...state.value.multiGoal.value]; src[index] = { ...src[index], [axis]: value };
  state.value.multiGoal.value = src;
  const key = getMarkerKey(markerRef ?? src[index]);
  state.value.areaRects.value = state.value.areaRects.value.map(rect => ({
    ...rect, dockPosition: (rect.dockPosition ?? []).map(dm => getMarkerKey(dm) === key ? { ...dm, [axis]: value } : dm)
  }));
}
function updateAreaLabel(id: string, label: string) {
  if (!state.value?.areaRects) return;
  state.value.areaRects.value = state.value.areaRects.value.map(r => r.id === id ? { ...r, label } : r);
}

const colorPalette = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#9ca3af'
];
const activeColorPicker = ref<string | null>(null);
function toggleColorPicker(key: string) { activeColorPicker.value = activeColorPicker.value === key ? null : key; }

function updateMarkerColor(marker: IPosition, color: string) {
  if (marker?.id != null) updateMarkerColorById(marker.id, color);
  else { const idx = indexOfOriginal(marker); if (idx !== -1) updateMarkerColorByIndex(idx, color); }
  activeColorPicker.value = null;
}
function updateAreaColor(id: string, color: string) {
  if (!state.value?.areaRects) return;
  state.value.areaRects.value = state.value.areaRects.value.map(r => r.id === id ? { ...r, color } : r);
  activeColorPicker.value = null;
}
function updateAreaType(id: string, type: 'navigation' | 'restrict') {
  if (!state.value?.areaRects) return;
  state.value.areaRects.value = state.value.areaRects.value.map(r => r.id === id ? { ...r, type } : r);
}
function updateMarkerColorById(id: string | number, color: string) {
  if (!state.value?.multiGoal || !state.value?.areaRects) return;
  const idStr = String(id);
  const src = [...state.value.multiGoal.value];
  for (let i = 0; i < src.length; i++) if (String(src[i]?.id) === idStr) src[i] = { ...src[i], color };
  state.value.multiGoal.value = src;
  state.value.areaRects.value = state.value.areaRects.value.map(rect => ({
    ...rect, dockPosition: (rect.dockPosition ?? []).map(dm => String(dm?.id ?? '') === idStr ? { ...dm, color } : dm)
  }));
}
function updateMarkerColorByIndex(index: number, color: string) {
  if (!state.value?.multiGoal) return;
  const src = [...state.value.multiGoal.value];
  if (index >= 0 && index < src.length) { src[index] = { ...src[index], color }; state.value.multiGoal.value = src; }
}

function resetZoom() { const me = mapEngine.value; if (me && typeof me.resetZoom === 'function') me.resetZoom(); }
function exportToJson() { emit("exportJson", { onclick: true }); }
function ExecuteGoal() { emit('ExecuteGoal', () => {}); }
function ExecuteCancelGoal() { emit('ExecuteCancelGoal', () => {}); }
</script>

<style scoped>
/* ── Adobe-style Properties Panel ──────────────────────── */
:root { --ip-bg: #1c1c1c; --ip-surface: #252525; --ip-border: #333; --ip-border-subtle: #2a2a2a; --ip-text: #d4d4d4; --ip-text-dim: #7a7a7a; --ip-accent: #0078d4; --ip-green: #22c55e; --ip-red: #ef4444; --ip-radius: 4px; }

.ip-panel {
  position: absolute;
  top: 90px;
  right: 12px;
  width: 280px;
  max-height: calc(100vh - 108px);
  background: #1c1c1c;
  color: #d4d4d4;
  border: 1px solid #333;
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0,0,0,.7), 0 1px 4px rgba(0,0,0,.4);
  display: flex;
  flex-direction: column;
  z-index: 2000;
  overflow: hidden;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

/* ── Title bar ─────────────────────────────────────────── */
.ip-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  height: 32px;
  background: #252525;
  border-bottom: 1px solid #333;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.ip-titlebar:focus { outline: 1px solid #0078d4; outline-offset: -1px; }
.ip-titlebar__left { display: flex; align-items: center; gap: 6px; }
.ip-titlebar__chevron { width: 10px; height: 10px; color: #7a7a7a; flex-shrink: 0; transform: rotate(0deg); transition: transform .18s ease; }
.ip-titlebar__chevron--open { transform: rotate(90deg); }
.ip-titlebar__title { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #b0b0b0; }
.ip-titlebar__hint { font-size: 10px; color: #555; }

/* ── Slide ─────────────────────────────────────────────── */
.ip-slide-enter-from, .ip-slide-leave-to { max-height: 0; opacity: 0; }
.ip-slide-enter-to, .ip-slide-leave-from { max-height: 80vh; opacity: 1; }
.ip-slide-enter-active, .ip-slide-leave-active { transition: max-height .2s ease, opacity .15s ease; }

/* ── Body ──────────────────────────────────────────────── */
.ip-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.ip-body::-webkit-scrollbar { width: 5px; }
.ip-body::-webkit-scrollbar-track { background: transparent; }
.ip-body::-webkit-scrollbar-thumb { background: #383838; border-radius: 3px; }
.ip-body::-webkit-scrollbar-thumb:hover { background: #484848; }

/* ── Section ───────────────────────────────────────────── */
.ip-section { border-bottom: 1px solid #2a2a2a; flex-shrink: 0; }
.ip-section--accent { border-bottom-color: rgba(59,130,246,.25); }

.ip-section__hd {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 28px;
  cursor: pointer;
  user-select: none;
  transition: background .12s;
  -webkit-tap-highlight-color: transparent;
}
.ip-section__hd--static { cursor: default; }
.ip-section__hd:not(.ip-section__hd--static):hover { background: rgba(255,255,255,.03); }

.ip-section__label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: #888;
  flex: 1;
}

.ip-caret { width: 8px; height: 8px; color: #555; flex-shrink: 0; transform: rotate(0deg); transition: transform .15s ease; }
.ip-caret--open { transform: rotate(90deg); }
.ip-caret--sm { width: 7px; height: 7px; }

.ip-chip {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(255,255,255,.08);
  color: #888;
  border: 1px solid #3a3a3a;
  flex-shrink: 0;
}
.ip-chip--blue { background: rgba(59,130,246,.15); color: #60a5fa; border-color: rgba(59,130,246,.3); }
.ip-chip--sm { font-size: 9px; padding: 1px 5px; }

.ip-section__bd { padding: 6px 8px 8px; }

/* ── Cards ─────────────────────────────────────────────── */
.ip-card {
  background: #222;
  border: 1px solid #2e2e2e;
  border-radius: 4px;
  margin-bottom: 6px;
  padding: 8px;
  cursor: pointer;
  transition: border-color .12s, background .12s;
}
.ip-card:hover { border-color: #3d3d3d; background: #242424; }
.ip-card--selected { border-color: #0078d4 !important; background: rgba(0,120,212,.07) !important; }
.ip-card--executing { border-left: 2px solid #3b82f6; }
.ip-card--area { cursor: default; }

.ip-card__topbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
}
.ip-card__name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.ip-card__actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; margin-left: auto; }

.ip-seq-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  background: #2e2e2e;
  border: 1px solid #3a3a3a;
  font-size: 10px;
  font-weight: 700;
  color: #888;
  flex-shrink: 0;
}
.ip-exec-tag {
  font-size: 10px;
  font-weight: 700;
  color: #60a5fa;
  background: rgba(59,130,246,.15);
  border: 1px solid rgba(59,130,246,.3);
  border-radius: 3px;
  padding: 1px 6px;
  flex: 1;
  animation: ip-pulse 2s infinite;
}
@keyframes ip-pulse { 0%,100% { opacity:.7; } 50% { opacity:1; } }

.ip-meta { font-size: 10px; color: #666; margin-bottom: 7px; }

/* ── Icon buttons ──────────────────────────────────────── */
.ip-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #777;
  cursor: pointer;
  transition: background .12s, color .12s;
  flex-shrink: 0;
  padding: 0;
}
.ip-icon-btn svg { width: 12px; height: 12px; }
.ip-icon-btn:hover { background: rgba(255,255,255,.08); color: #ccc; }
.ip-icon-btn:disabled { opacity: .25; cursor: not-allowed; }
.ip-icon-btn--danger:hover { background: rgba(239,68,68,.15); color: #f87171; }
.ip-icon-btn--sm { width: 18px; height: 18px; }
.ip-icon-btn--sm svg { width: 10px; height: 10px; }

.ip-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,.25);
  flex-shrink: 0;
}

/* ── Field row (label + input) ─────────────────────────── */
.ip-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ip-field-lbl { font-size: 10px; color: #666; width: 36px; flex-shrink: 0; text-align: right; }
.ip-field-input {
  flex: 1;
  background: #181818;
  border: 1px solid #333;
  border-radius: 3px;
  color: #d4d4d4;
  font-size: 12px;
  padding: 4px 7px;
  outline: none;
  transition: border-color .12s;
  min-width: 0;
}
.ip-field-input:focus { border-color: #0078d4; background: #1e1e1e; }

/* ── XYZ row ───────────────────────────────────────────── */
.ip-xyz-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
  margin-bottom: 6px;
}
.ip-xyz-cell { display: flex; flex-direction: column; gap: 2px; }
.ip-xyz-lbl { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: .04em; padding-left: 2px; }
.ip-xyz-input {
  width: 100%;
  background: #181818;
  border: 1px solid #333;
  border-radius: 3px;
  color: #d4d4d4;
  font-size: 11px;
  padding: 4px 4px;
  text-align: center;
  outline: none;
  transition: border-color .12s;
  -webkit-appearance: none;
}
.ip-xyz-input:focus { border-color: #0078d4; background: #1e1e1e; }

/* ── Params (sliders) ──────────────────────────────────── */
.ip-params {
  background: #181818;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 6px;
}
.ip-params--sm { padding: 5px 7px; }
.ip-param-row { display: flex; align-items: center; gap: 6px; height: 20px; }
.ip-param-lbl { font-size: 10px; color: #666; width: 50px; flex-shrink: 0; }
.ip-param-unit { font-size: 10px; color: #555; width: 16px; flex-shrink: 0; text-align: right; }

.ip-slider {
  flex: 1;
  min-width: 0;
  -webkit-appearance: none;
  height: 3px;
  background: #333;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  accent-color: #0078d4;
}
.ip-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #0078d4;
  border: 2px solid #1c1c1c;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,.5);
}
.ip-slider::-webkit-slider-runnable-track { background: transparent; }

.ip-num {
  background: #1c1c1c;
  border: 1px solid #333;
  border-radius: 3px;
  color: #d4d4d4;
  font-size: 11px;
  padding: 2px 4px;
  text-align: right;
  outline: none;
  width: 42px;
  flex-shrink: 0;
  -webkit-appearance: none;
}
.ip-num--wide { flex: 1; min-width: 0; width: auto; text-align: left; }
.ip-num:focus { border-color: #0078d4; }

/* ── Inline name (area title) ──────────────────────────── */
.ip-inline-name {
  flex: 1;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: #ccc;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 4px;
  outline: none;
  min-width: 0;
  transition: border-color .12s, background .12s;
}
.ip-inline-name:hover { border-color: #3a3a3a; background: #1c1c1c; }
.ip-inline-name:focus { border-color: #0078d4; background: #1c1c1c; }
.ip-inline-name--sm { font-size: 11px; }

/* ── Type toggle ───────────────────────────────────────── */
.ip-toggle-row {
  display: flex;
  background: #181818;
  border: 1px solid #2e2e2e;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}
.ip-toggle-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: #666;
  font-size: 10px;
  font-weight: 600;
  padding: 5px 0;
  cursor: pointer;
  transition: all .12s;
  letter-spacing: .03em;
}
.ip-toggle-btn:hover { color: #aaa; background: rgba(255,255,255,.04); }
.ip-toggle-btn--nav { background: rgba(0,120,212,.2); color: #60a5fa; }
.ip-toggle-btn--restrict { background: rgba(239,68,68,.18); color: #f87171; }

/* ── Dock (in-area markers) ────────────────────────────── */
.ip-dock {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #2a2a2a;
}
.ip-dock__hd {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 4px;
  cursor: pointer;
  border-radius: 3px;
  transition: background .12s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.ip-dock__hd:hover { background: rgba(255,255,255,.04); }
.ip-dock__label { font-size: 10px; color: #666; flex: 1; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
.ip-dock__list { list-style: none; margin: 5px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.ip-dock__item {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ip-dock__topbar { display: flex; align-items: center; gap: 4px; }

/* ── Color palette ─────────────────────────────────────── */
.ip-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 6px;
  background: #181818;
  border: 1px solid #2e2e2e;
  border-radius: 4px;
  margin-bottom: 6px;
}
.ip-swatch {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform .1s, border-color .1s;
  flex-shrink: 0;
}
.ip-swatch:hover { transform: scale(1.15); }
.ip-swatch--active { border-color: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.3); }

/* ── Selection section ─────────────────────────────────── */
.ip-sub-group { margin-bottom: 6px; }
.ip-sub-label { font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #666; padding: 2px 4px; }
.ip-sel-row { display: flex; align-items: center; gap: 5px; padding: 3px 4px; border-radius: 3px; font-size: 11px; }
.ip-sel-row:hover { background: rgba(255,255,255,.03); }
.ip-sel-icon { width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ip-sel-icon svg { width: 12px; height: 12px; }
.ip-sel-icon--rect { color: #9ca3af; font-size: 13px; }
.ip-sel-name { flex: 1; font-weight: 500; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ip-sel-pos { font-size: 10px; color: #555; white-space: nowrap; }
.ip-sel-tag { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 2px; }
.ip-sel-tag--nav { background: rgba(0,120,212,.2); color: #60a5fa; }
.ip-sel-tag--danger { background: rgba(239,68,68,.15); color: #f87171; }

/* ── Controls ──────────────────────────────────────────── */
.ip-ctrl-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
.ip-ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 8px;
  background: #252525;
  border: 1px solid #333;
  border-radius: 3px;
  color: #aaa;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all .12s;
  -webkit-tap-highlight-color: transparent;
  min-height: 30px;
}
.ip-ctrl-btn svg { width: 13px; height: 13px; flex-shrink: 0; }
.ip-ctrl-btn:hover { background: #2e2e2e; border-color: #444; color: #d4d4d4; }
.ip-ctrl-btn:disabled { opacity: .3; cursor: not-allowed; }
.ip-ctrl-btn--execute { background: rgba(34,197,94,.1); border-color: rgba(34,197,94,.3); color: #4ade80; }
.ip-ctrl-btn--execute:hover { background: rgba(34,197,94,.18); border-color: rgba(34,197,94,.45); }
.ip-ctrl-btn--cancel { background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.25); color: #f87171; }
.ip-ctrl-btn--cancel:hover { background: rgba(239,68,68,.15); border-color: rgba(239,68,68,.4); }

/* ── Footer ────────────────────────────────────────────── */
.ip-footer {
  margin-top: auto;
  border-top: 1px solid #2a2a2a;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  background: #1a1a1a;
}
.ip-info-row { display: flex; justify-content: space-between; align-items: center; }
.ip-info-lbl { font-size: 10px; color: #555; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.ip-info-val { font-size: 11px; color: #888; font-variant-numeric: tabular-nums; }
.ip-info-val--mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 10px; }

/* ── Misc ──────────────────────────────────────────────── */
.ip-empty { font-size: 11px; color: #4a4a4a; padding: 6px 4px; font-style: italic; }
.ip-empty--sm { padding: 4px; font-size: 10px; }

@media (max-width: 768px) {
  .ip-panel { top: 150px; right: 8px; width: calc(100vw - 16px); max-height: calc(100vh - 166px); }
  .ip-ctrl-btn { min-height: 36px; }
}
</style>
