import { LitElement, html, css, CSSResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { MiniMediaPlayerSpeakerGroupEntry } from '../config/types';
import { HomeAssistant } from '../types';

import t from '../utils/translation';

import './checkbox';

export interface GroupChangeEvent extends CustomEvent {
  detail: {
    entity: string;
    checked: boolean;
  };
}

@customElement('mmp-group-item')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class MiniMediaPlayerGroupItem extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public item!: MiniMediaPlayerSpeakerGroupEntry;
  @property({ attribute: false }) public checked!: boolean;
  @property({ attribute: false }) public disabled!: boolean;
  @property({ attribute: false }) public master!: boolean;

  render() {
    const stateObj = this.hass.states[this.item.entity_id];
    const volume = stateObj?.attributes?.volume_level ?? 0;
    const features = stateObj?.attributes?.supported_features ?? 0;
    const supportsVolume = (features & 4) !== 0; // VOLUME_SET

    return html`
      <div class="row">
        <div class="left">
          <mmp-checkbox
            .checked=${this.checked}
            .disabled=${this.disabled}
            @change="${(e: MouseEvent) => e.stopPropagation()}"
            @click="${this.handleClick}"
          >
            ${this.item.name}
            ${this.master
              ? html`<span class="master">(${t(this.hass, 'label.master')})</span>`
              : ''}
          </mmp-checkbox>
        </div>

        <div class="right">
          ${supportsVolume ? html`
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              .value=${volume}
              @mousedown=${this.stopEvent}
              @touchstart=${this.stopEvent}
              @click=${this.stopEvent}
              @input=${this.handleVolumeChange}
            />
          ` : ''}
        </div>
      </div>
    `;
  }
/*
  private handleVolumeChange(ev: Event): void {
    const newValue = Number((ev.target as HTMLInputElement).value);

    this.hass.callService("media_player", "volume_set", {
      entity_id: this.item.entity_id,
      volume_level: newValue,
    });
  }
*/
  private handleVolumeChange(ev: Event): void {
    const newValue = Number((ev.target as HTMLInputElement).value);

    // Always set this speaker's volume
    this.hass.callService("media_player", "volume_set", {
      entity_id: this.item.entity_id,
      volume_level: newValue,
    });

    // Notify parent
    this.dispatchEvent(new CustomEvent("volume-change", {
      detail: {
        entity: this.item.entity_id,
        volume: newValue,
      },
      bubbles: true,
      composed: true,
    }));
  }

  private handleClick(ev: MouseEvent): void {
    ev.stopPropagation();
    ev.preventDefault();
    if (this.disabled) return;
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: {
          entity: this.item.entity_id,
          checked: !this.checked,
        },
      }),
    );
  }

  private stopEvent(ev: Event): void {
    ev.stopPropagation();
  }

  static get styles(): CSSResult {
    return css`
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
      }

      .left {
        flex: 1;
        display: flex;
        align-items: center;
      }

      .right {
        flex: 1;
        display: flex;
        align-items: center;
      }

      input[type="range"] {
        width: 100%;
        height: 28px;
        -webkit-appearance: none;
        background: transparent;
      }

      input[type="range"]::-webkit-slider-runnable-track {
        height: 4px;
        background: var(--mmp-bg-color, rgba(255,255,255,0.25));
        border-radius: 2px;
      }

      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        height: 14px;
        width: 14px;
        border-radius: 50%;
        background: var(--mmp-accent-color, var(--accent-color));
        margin-top: -5px;
      }

      input[type="range"]::-moz-range-track {
        height: 4px;
        background: var(--mmp-bg-color, rgba(255,255,255,0.25));
        border-radius: 2px;
      }

      input[type="range"]::-moz-range-thumb {
        height: 14px;
        width: 14px;
        border-radius: 50%;
        background: var(--mmp-accent-color, var(--accent-color));
      }

      .master {
        font-weight: 500;
        margin-left: 4px;
      }
    `;
}

}
