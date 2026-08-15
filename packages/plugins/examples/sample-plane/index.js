/** Example community plane plugin */

export const plane = {
  id: 'sample-custom-plane',
  optIn: true,
  label: 'Sample Custom Plane',
  async status() {
    return {
      id: 'sample-custom-plane',
      label: 'Sample Custom Plane',
      armed: false,
      phase: 'community',
      message: 'Replace with your deception module',
    };
  },
  async onEngagement(signal) {
    return { received: true, score: signal?.score || 0 };
  },
};