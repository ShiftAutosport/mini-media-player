import { LitElement, html, css, CSSResult, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import t from '../utils/translation';

import './groupItem';
import './button';
import { HomeAssistant } from '../types';
import MediaPlayerObject from '../model';
import { MiniMediaPlayerSpeakerGroupEntry } from '../config/types';
import { GroupChangeEvent } from './groupItem';

@customElement('mmp-group-list')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class MiniMediaPlayerGroupList extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public entities!: MiniMediaPlayerSpeakerGroupEntry[];
  @property({ attribute: false }) public player!: MediaPlayerObject;
  @property({ attribute: false }) public visible!: boolean;
  @property({ attribute: false }) public volumeTracking = false;
  @property({ attribute: false }) public matchMasterVolume = false;

  get group(): string[] {
    return this.player.group;
  }

  get master(): string {
    return this.player.master;
  }

  get isMaster(): boolean {
    return this.player.isMaster;
  }

  get isGrouped(): boolean {
    return this.player.isGrouped;
  }
/*
  private handleGroupChange(ev: GroupChangeEvent): void {
    const { entity, checked } = ev.detail;
    this.player.handleGroupChange(ev, entity, checked);
  }
*/
  private handleGroupChange(ev: GroupChangeEvent): void {
    const { entity, checked } = ev.detail;

    // If joining AND matchMasterVolume is enabled → inherit master volume
    if (checked && this.matchMasterVolume) {
      const masterState = this.hass.states[this.master];
      const masterVolume = masterState?.attributes?.volume_level ?? 0;

      this.hass.callService("media_player", "volume_set", {
        entity_id: entity,
        volume_level: masterVolume,
      });
    }

    // Existing logic
    this.player.handleGroupChange(ev, entity, checked);
  }

  private toggleVolumeTracking(ev: Event) {
    ev.stopPropagation();
    this.volumeTracking = !this.volumeTracking;
  }

  private toggleMatchMasterVolume(ev: Event) {
    ev.stopPropagation();
    this.matchMasterVolume = !this.matchMasterVolume;

    // If turning ON → sync all currently grouped speakers
    if (this.matchMasterVolume) {
      const masterState = this.hass.states[this.master];
      const masterVolume = masterState?.attributes?.volume_level ?? 0;

      for (const item of this.entities) {
        const id = item.entity_id;

        // Only apply to grouped speakers, not the master
        if (id !== this.master && this.group.includes(id)) {
          this.hass.callService("media_player", "volume_set", {
            entity_id: id,
            volume_level: masterVolume,
          });
        }
      }
    }
  }

  render() {
    if (!this.visible) return html``;
    const { group, isMaster, isGrouped } = this;
    const { id } = this.player;
    return html`
      <div class="mmp-group-list">
        <div class="mmp-group-list__header">
          <span class="mmp-group-list__title">
            ${t(this.hass, 'title.speaker_management')}
          </span>

          <div class="mmp-group-list__toggles">
            <mmp-checkbox
              toggle
              .checked=${this.volumeTracking}
              @click=${this.toggleVolumeTracking}
            >
              Volume Tracking
            </mmp-checkbox>

            <mmp-checkbox
              toggle
              .checked=${this.matchMasterVolume}
              @click=${this.toggleMatchMasterVolume}
            >
              Match Master Volume
            </mmp-checkbox>
          </div>
        </div>
        ${this.entities.map((item) => this.renderItem(item, id))}
        <div class="mmp-group-list__buttons">
          <mmp-button raised ?disabled=${!isGrouped} @click=${(e) => this.player.handleGroupChange(e, id, false)}>
            <span>${t(this.hass, 'label.leave')}</span>
          </mmp-button>
          ${isGrouped && isMaster
            ? html`
                <mmp-button raised @click=${(e) => this.player.handleGroupChange(e, group, false)}>
                  <span>${t(this.hass, 'label.ungroup')}</span>
                </mmp-button>
              `
            : html``}
          <mmp-button
            raised
            ?disabled=${!isMaster}
            @click=${(e) =>
              this.player.handleGroupChange(
                e,
                this.entities.map((item) => item.entity_id),
                true,
              )}
          >
            <span>${t(this.hass, 'label.group_all')}</span>
          </mmp-button>
        </div>
      </div>
    `;
  }

  private renderItem(item: MiniMediaPlayerSpeakerGroupEntry, entityId: string): TemplateResult {
    const itemId = item.entity_id;
    return html`
      <mmp-group-item
        @change=${this.handleGroupChange}
        @volume-change=${this.handleVolumeChange}
        .item=${item}
        .hass=${this.hass}
        .checked=${itemId === entityId || this.group.includes(itemId)}
        .disabled=${itemId === entityId || !this.isMaster}
        .master=${itemId === this.master}
      />
    `;
  }

  private handleVolumeChange(ev: CustomEvent) {
    const { entity, volume } = ev.detail;

    // 1. Volume Tracking: sync all speakers
    if (this.volumeTracking) {
      for (const item of this.entities) {
        const id = item.entity_id;

        // Only sync speakers that are in the group
        if (this.group.includes(id) || id === this.master) {
          this.hass.callService("media_player", "volume_set", {
            entity_id: id,
            volume_level: volume,
          });
        }
      }
    }
  }

  static get styles(): CSSResult {
    return css`
      .mmp-group-list {
        display: flex;
        flex-direction: column;
        margin-left: 8px;
        margin-bottom: 8px;
      }
      .mmp-group-list__title {
        font-weight: 500;
        letter-spacing: 0.1em;
        margin: 8px 0 4px;
        text-transform: uppercase;
      }
      .mmp-group-list__buttons {
        display: flex;
      }
      mmp-button {
        margin: 8px 8px 0 0;
        min-width: 0;
        text-transform: uppercase;
        text-align: center;
        width: 50%;
        --mdc-theme-primary: transparent;
      }
      .mmp-group-list__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 8px 0 4px;
      }

      .mmp-group-list__toggles label {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
      }

      .mmp-group-list__toggles {
        display: flex;
        gap: 16px;
        margin-left: auto;
        align-items: center;
      }
    `;
  }
}
