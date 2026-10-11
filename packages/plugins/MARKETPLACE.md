# DM-Sentinel Plugin Marketplace Conventions

## Plugin contract

Each plugin is a folder with `index.js` exporting:

```js
export const plane = {
  id: 'my-plane',
  optIn: true,
  label: 'Human Name',
  async status(config) { return { armed: false, ... }; },
  async onEngagement(signal) { return {}; },
};
```

## Registration

Add to `~/.ghost-continuum/config.json`:

```json
{
  "continuum": {
    "plugins": [
      "/path/to/my-plugin",
      "packages/plugins/examples/sample-plane"
    ]
  }
}
```

## Requirements

- Defensive-only behavior
- Local-first data storage
- No arbitrary code execution from attacker input
- Document legal posture in plugin README

## Publishing

1. MIT or compatible license
2. SECURITY.md with scope statement
3. Single-purpose plane or visualization module
4. Open issue at [ghost-continuum](https://github.com/Pitchfork-and-Torch/ghost-continuum) for listing