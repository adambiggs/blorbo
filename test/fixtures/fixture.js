const canvas = document.getElementById('blorbo');
const preset = document.body.dataset.preset;
window.fixtureBlorbo = Blorbo.createBlorbo(canvas, { preset: Blorbo.presets[preset], persist: false });
