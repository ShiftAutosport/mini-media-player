import { LitElement, html, css } from 'lit';
import { styleMap } from 'lit/directives/style-map';

import './dropdown';
import './button';

import sharedStyle from '../sharedStyle';

class MiniMediaPlayerShortcuts extends LitElement {
  static get properties() {
    return {
      player: { hasChanged: () => true },
      shortcuts: {},
      hass: { hasChanged: () => true },
      buttons: { attribute: false },
    };
  }

  constructor() {
    super();
    this._hass = undefined;

    // Runtime metadata, without mutating button config objects
    this._cardMap = new WeakMap(); // btn -> embedded card element
    this._idMap = new WeakMap();   // btn -> stable ID string
    this._idCounter = 0;

    this._helpers = null;
  }

  // --- hass passthrough ---

  set hass(value) {
    const old = this._hass;
    this._hass = value;
    this.requestUpdate("hass", old);
  }

  get hass() {
    return this._hass;
  }

  // --- convenience getters ---

  get buttons() {
    return this.shortcuts?.buttons;
  }

  get list() {
    return this.shortcuts?.list;
  }

  get show() {
    return (!this.shortcuts.hide_when_off || this.player.isActive);
  }

  get active() {
    return this.player.getAttribute(this.shortcuts.attribute);
  }

  get height() {
    return this.shortcuts.column_height || 36;
  }

  // --- button metadata (no mutation) ---

  _getId(btn) {
    if (!this._idMap.has(btn)) {
      this._idMap.set(btn, `mmp-btn-${this._idCounter++}`);
    }
    return this._idMap.get(btn);
  }

  _getCard(btn) {
    return this._cardMap.get(btn);
  }

  _setCard(btn, card) {
    this._cardMap.set(btn, card);
  }

  // --- type detection ---

  _isButtonCardShortcut(btn) {
    return (
      btn.type === "button-card" ||
      btn.type === "custom:button-card" ||
      btn.use_button_card === true
    );
  }

  // --- visibility ---

  _evaluateVisibility(conditions) {
    return conditions.every(cond => {
      if (cond.condition === "state") {
        return this.hass.states[cond.entity]?.state === cond.state;
      }
      return true;
    });
  }

  // --- button-card placeholder renderer ---

  _renderButtonCardShortcut(btn) {
    const col = this.shortcuts.columns ?? 2;
    const width = {
      1: "100%",
      2: "50%",
      3: "33.33%",
      4: "25%",
      5: "20%",
      6: "16.66%",
    }[col];

    if (btn.visibility) {
      const visible = this._evaluateVisibility(btn.visibility);
      if (!visible) return html``;
    }

    const id = this._getId(btn);

    return html`
      <div
        class="mmp-shortcuts__button"
        @click=${e => e.stopPropagation()}
        @mousedown=${e => e.stopPropagation()}
        @pointerdown=${e => e.stopPropagation()}
        style="
          min-width: calc(${width} - 8px);
          flex: 1;
          min-height: ${this.height}px;
          display: flex;
          align-items: stretch;
        "
        data-button-card="${id}"
      ></div>
    `;
  }

  // --- helpers loader (Solution A) ---

  async _loadHelpers() {
    if (!this._helpers) {
      this._helpers = await window.loadCardHelpers();
    }
    return this._helpers;
  }

  // --- sanitize config (minimal; HA does the heavy lifting) ---

  _sanitizeButtonCardConfig(btn) {
    const allowed = [
      "type", "entity", "name", "icon", "image",
      "show_name", "show_icon", "show_state",
      "tap_action", "hold_action", "double_tap_action",
      "styles", "state", "color", "template",
      "variables", "visibility", "aspect_ratio",
      "size", "layout",
    ];

    const config = {};
    for (const key of allowed) {
      if (btn[key] !== undefined) config[key] = btn[key];
    }

    if (!config.type) config.type = "custom:button-card";

    return config;
  }

  async _injectButtonCards() {
    const helpers = await this._loadHelpers();

    this._filteredButtons().forEach(btn => {
      if (!this._isButtonCardShortcut(btn)) return;

      const id = this._getId(btn);
      const placeholder = this.renderRoot.querySelector(
        `[data-button-card="${id}"]`
      );
      if (!placeholder || placeholder.childElementCount > 0) return;

      const config = this._sanitizeButtonCardConfig(btn);

      // Use HA’s internal card factory
      const wrapper = helpers.createCardElement(config);

      // Extract real <button-card> if present
      let card = wrapper.querySelector?.("button-card");
      if (!card) card = wrapper;

      // Create wrapper div so MMP’s CSS applies
      const alignWrapper = document.createElement("div");
      alignWrapper.style.display = "flex";
      alignWrapper.style.justifyContent = "center";
      alignWrapper.style.alignItems = "center";
      alignWrapper.style.width = "100%";

      // Put button-card inside wrapper
      alignWrapper.appendChild(card);

      // Insert wrapper into placeholder
      placeholder.innerHTML = "";
      placeholder.appendChild(alignWrapper);

      // Ensure host <button-card> stretches
      customElements.whenDefined("button-card").then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            card.style.flex = "1 1 100%";
            card.style.maxWidth = "100%";
            card.style.width = "100%";
          });
        });
      });

      // Store reference and set hass
      this._setCard(btn, card);
      card.hass = this.hass;
    });
  }

  // --- lifecycle ---

  updated() {
    // 1. Update embedded button-cards
    this._filteredButtons().forEach(btn => {
      const card = this._getCard(btn);
      if (card) card.hass = this.hass;
    });

    // 2. Update legacy MMP buttons
    this.renderRoot.querySelectorAll("mmp-button").forEach(btn => {
      btn.hass = this.hass;
    });

    // 3. Defer async helpers + injection
    Promise.resolve().then(() => this._injectButtonCards());
  }

  // --- filtering / expressions / templates ---
/*
  _filteredButtons() {
    if (!this.buttons) {
      return [];
    }

    return this.buttons.filter(btn => {
      if (typeof btn.show_when === "boolean") {
        if (!btn.show_when) return false;
      }
      if (typeof btn.show_when === "string") {
        const val = this._evalExpression(btn.show_when);
        if (!val) return false;
      }
      if (typeof btn.hide_when === "boolean") {
        if (btn.hide_when) return false;
      }
      if (typeof btn.hide_when === "string") {
        const val = this._evalExpression(btn.hide_when);
        if (val) return false;
      }
      return true;
    });
  }
*/
  _filteredButtons() {
    console.group("MMP SHORTCUTS — FILTERED BUTTONS");

    console.log("this.buttons:", this.buttons);
    console.log("this.player:", this.player);
    console.log("this.shortcuts:", this.shortcuts);

    if (!this.buttons) {
      console.warn("NO BUTTONS — returning empty array");
      console.groupEnd();
      return [];
    }

    const result = this.buttons.filter(btn => {
      console.log("Evaluating button:", btn.name || btn.entity || btn);

      // SHOW WHEN (boolean)
      if (typeof btn.show_when === "boolean") {
        console.log("  show_when (bool):", btn.show_when);
        if (!btn.show_when) {
          console.log("  → HIDDEN (show_when false)");
          return false;
        }
      }

      // SHOW WHEN (expression)
      if (typeof btn.show_when === "string") {
        const val = this._evalExpression(btn.show_when);
        console.log("  show_when (expr):", btn.show_when, "→", val);
        if (!val) {
          console.log("  → HIDDEN (show_when expr false)");
          return false;
        }
      }

      // HIDE WHEN (boolean)
      if (typeof btn.hide_when === "boolean") {
        console.log("  hide_when (bool):", btn.hide_when);
        if (btn.hide_when) {
          console.log("  → HIDDEN (hide_when true)");
          return false;
        }
      }

      // HIDE WHEN (expression)
      if (typeof btn.hide_when === "string") {
        const val = this._evalExpression(btn.hide_when);
        console.log("  hide_when (expr):", btn.hide_when, "→", val);
        if (val) {
          console.log("  → HIDDEN (hide_when expr true)");
          return false;
        }
      }

      console.log("  → VISIBLE");
      return true;
    });

    console.log("FINAL FILTERED BUTTONS:", result);
    console.groupEnd();

    return result;
  }

  _evalExpression(expression) {
    try {
      const hass = this.hass;
      const entity = this.player?.entity;
      const player = this.player;

      /* eslint no-new-func: "off" */
      return new Function(
        "hass",
        "entity",
        "player",
        `"use strict"; return (${expression});`
      )(hass, entity, player);
    } catch (e) {
      console.warn("[MMP] Expression evaluation error:", e, expression);
      return null;
    }
  }

  _resolveTemplate(str, hass) {
    if (typeof str !== "string") return str;
    if (!str.includes("{{")) return str;
    try {
      const player = this.player;
      const states = hass?.states ?? {};
      const expr = str.replace(/{{(.*?)}}/g, (_, code) => {
        return `" + (() => { try { return ${code.trim()}; } catch(e) { console.warn("TEMPLATE ERROR:", e); return ""; } })() + "`;
      });
      const result = Function("player", "states", `return "${expr}";`)(player, states);
      return result;
    } catch (e) {
      console.warn("Template error in name:", str, e);
      return str;
    }
  }

  // --- render ---

  render() {
    console.warn(
    "[MMP-DEBUG] render() shortcuts:",
      {
        player_source: this.player?.source,
        player_state: this.player?.state,
        player_entity: this.player?.entity_id,
        shortcuts_count: this.shortcuts?.length,
      }
    );

    if (!this.show) return html``;
    const { active } = this;

    const list = this.list ? html`
      <mmp-dropdown class="mmp-shortcuts__dropdown"
        @change=${this.handleShortcut}
        .items=${this.list}
        .label=${this.shortcuts.label}
        .selected=${active}>
      </mmp-dropdown>
    ` : "";

    const buttons = this.shortcuts ? html`
      <div class="mmp-shortcuts__buttons">
        ${this._filteredButtons().map(item => {
          if (this._isButtonCardShortcut(item)) {
            return this._renderButtonCardShortcut(item);
          }
          return html`
            <mmp-button
              style="${styleMap(this.shortcutStyle(item))}"
              raised
              columns=${this.shortcuts.columns ?? ""}
              ?color=${item.id != null && item.id === active}
              class="mmp-shortcuts__button"
              @click=${e => this.handleShortcut(e, item)}>
              <div align=${this.shortcuts.align_text ?? "center"}>
                ${item.icon ? html`<ha-icon .icon=${item.icon}></ha-icon>` : ""}
                ${item.image ? html`<img src=${item.image}>` : ""}
                ${item.name ? html`
                  <span class="ellipsis">
                    ${(() => {
                      const resolved = this._resolveTemplate(item.name, this.hass);
                      return resolved;
                    })()}
                  </span>
                ` : ""}
              </div>
            </mmp-button>
          `;
        })}
      </div>
    ` : "";

    return html`
      ${buttons}
      ${list}
    `;
  }

  // --- shortcut actions ---

  handleShortcut(ev, item) {
    const shortcut = item || ev.detail;
    const { type, id, data } = shortcut;

    if (type === "source")
      return this.player.setSource(ev, id);
    if (type === "service")
      return this.player.toggleService(ev, id, data);
    if (type === "script")
      return this.player.toggleScript(ev, id, data);
    if (type === "sound_mode")
      return this.player.setSoundMode(ev, id);

    const options = {
      media_content_type: type,
      media_content_id: id,
    };
    this.player.setMedia(ev, options);
  }

  // --- shortcut styling ---

  shortcutStyle(item) {
    return {
      "min-height": `${this.height}px`,
      ...(item.cover ? { "background-image": `url(${item.cover})` } : {}),
    };
  }

  static get styles() {
    return [
      sharedStyle,
      css`
        .mmp-shortcuts__buttons {
          box-sizing: border-box;
          display: flex;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .mmp-shortcuts__button {
          min-width: calc(50% - 8px);
          flex: 1;
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center center;
        }
        .mmp-shortcuts__button > div {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          padding: .2em 0;
        }
        .mmp-shortcuts__button > div[align='left'] {
          justify-content: flex-start;
        }
        .mmp-shortcuts__button > div[align='right'] {
          justify-content: flex-end;
        }
        .mmp-shortcuts__button[columns='1'] {
          min-width: calc(100% - 8px);
        }
        .mmp-shortcuts__button[columns='3'] {
          min-width: calc(33.33% - 8px);
        }
        .mmp-shortcuts__button[columns='4'] {
          min-width: calc(25% - 8px);
        }
        .mmp-shortcuts__button[columns='5'] {
          min-width: calc(20% - 8px);
        }
        .mmp-shortcuts__button[columns='6'] {
          min-width: calc(16.66% - 8px);
        }
        .mmp-shortcuts__button > div > span {
          line-height: calc(var(--mmp-unit) * .6);
          text-transform: initial;
        }
        .mmp-shortcuts__button > div > ha-icon {
          width: calc(var(--mmp-unit) * .6);
          height: calc(var(--mmp-unit) * .6);
        }
        .mmp-shortcuts__button > div > *:nth-child(2) {
          margin-left: 4px;
        }
        .mmp-shortcuts__button > div > img {
          height: 24px;
        }
      `,
    ];
  }
}

customElements.define('mmp-shortcuts', MiniMediaPlayerShortcuts);
