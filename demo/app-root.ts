import {
  html,
  css,
  LitElement,
  customElement,
  internalProperty,
  query,
} from 'lit-element';
import { LocalCache } from '../src/local-cache';

@customElement('app-root')
export class AppRoot extends LitElement {
  private localCache = new LocalCache();

  private cacheKeyName = 'cache-demo';

  @internalProperty()
  private cacheValue?: string;

  @query('#cacheValue') cacheValueInput!: HTMLInputElement;

  @query('#cacheTTL') cacheTTLInput!: HTMLInputElement;

  render() {
    return html`
      <h1>Local Cache</h1>

      <p>
        Open the developer tools and look for the indexedDB storage. When you
        set the cache, you should see a new entry in it. It doesn't update
        automatically so you may have to refresh it.
      </p>

      <fieldset>
        <legend>Manage Cache</legend>
        <dl>
          <dt>Cache Value</dt>
          <dd><input id="cacheValue" type="text" value="Some Value" /></dd>
          <dt>Cache TTL</dt>
          <dd><input id="cacheTTL" type="number" value="10" /> seconds</dd>
        </dl>
        <button @click=${this.setCache}>Set Cache</button>
        <button @click=${this.clearCache}>Clear Cache</button>
      </fieldset>

      <p>
        If you click "Get Cached Value" after it has expired, it will remove the
        cache entry.
      </p>
      <fieldset>
        <legend>View Cache</legend>
        <p>Value: ${this.cacheValue ?? 'No Cache'}</p>
        <button @click=${this.getCache}>Get Cached Value</button>
      </fieldset>
    `;
  }

  firstUpdated() {
    this.getCache();
  }

  private async setCache() {
    const cacheValue = this.cacheValueInput.value;
    const cacheTTL = parseFloat(this.cacheTTLInput.value);
    await this.localCache.set({
      key: this.cacheKeyName,
      value: cacheValue,
      ttl: cacheTTL,
    });
    await this.getCache();
  }

  private async clearCache() {
    await this.localCache.delete(this.cacheKeyName);
    await this.getCache();
  }

  private async getCache() {
    this.cacheValue = await this.localCache.get(this.cacheKeyName);
  }

  static styles = css`
    :host {
      display: block;
      padding: 25px;
      color: var(--your-webcomponent-text-color, #000);
    }
  `;
}
