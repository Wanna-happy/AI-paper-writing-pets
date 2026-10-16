(function (root) {
  class IncrementalText {
    constructor(render, { interval = 24, batch = 8, schedule = (fn, delay) => setTimeout(fn, delay), unschedule = id => clearTimeout(id) } = {}) {
      Object.assign(this, { render, interval, batch, schedule, unschedule });
      this.text = ''; this.position = 0; this.timer = null; this.waiters = [];
    }
    push(delta) {
      this.text += String(delta || '');
      if (this.timer === null) this.tick();
    }
    tick() {
      this.timer = null;
      if (this.position < this.text.length) {
        this.position = Math.min(this.text.length, this.position + this.batch);
        if (/[\uD800-\uDBFF]/.test(this.text[this.position - 1] || '') && this.position < this.text.length) this.position++;
        this.render(this.text.slice(0, this.position));
      }
      if (this.position < this.text.length) this.timer = this.schedule(() => this.tick(), this.interval);
      else this.waiters.splice(0).forEach(resolve => resolve());
    }
    reset(text = '') {
      this.cancel(); this.text = String(text); this.position = this.text.length;
      this.render(this.text);
    }
    async finish(text) {
      const final = String(text || '');
      if (!final.startsWith(this.text)) this.reset();
      this.push(final.slice(this.text.length));
      if (this.position < this.text.length) await new Promise(resolve => this.waiters.push(resolve));
    }
    cancel() {
      if (this.timer !== null) this.unschedule(this.timer);
      this.timer = null;
      this.waiters.splice(0).forEach(resolve => resolve());
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = IncrementalText;
  else root.IncrementalText = IncrementalText;
})(typeof globalThis !== 'undefined' ? globalThis : this);
