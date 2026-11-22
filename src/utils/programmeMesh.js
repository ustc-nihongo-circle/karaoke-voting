export function mountProgrammeMesh(canvas) {
  const ctx = canvas.getContext('2d');
  let pending = 0;
  let previousSize = '';

  function grain(x, y, seed = 0) {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 41.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function draw() {
    pending = 0;
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1.75);
    const size = width + 'x' + height + '@' + scale;
    if (size === previousSize) return;
    previousSize = size;

    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const style = getComputedStyle(canvas);
    const color = name => style.getPropertyValue(name).trim() || 'transparent';
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, color('--mesh-start'));
    base.addColorStop(.48, color('--mesh-mid'));
    base.addColorStop(.76, color('--mesh-end-mid'));
    base.addColorStop(1, color('--mesh-end'));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    const light = ctx.createRadialGradient(width * .8, height * .29, 10, width * .8, height * .29, Math.max(width, height) * .64);
    light.addColorStop(0, color('--mesh-light'));
    light.addColorStop(1, color('--mesh-light-end'));
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-26 * Math.PI / 180);
    const step = width < 760 ? 105 : 178;
    const rowHeight = step * .866;
    const radius = Math.hypot(width, height) / 2;
    const countX = Math.ceil(radius / step) + 2;
    const countY = Math.ceil(radius / rowHeight) + 2;
    const point = (column, row) => [
      (column + (row & 1) * .5) * step,
      row * rowHeight,
    ];
    const tileLight = color('--mesh-tile-light');
    const tile = color('--mesh-tile');
    const halo = color('--mesh-halo');
    const line = color('--mesh-line');
    for (let row = -countY; row < countY; row += 1) {
      for (let column = -countX; column < countX; column += 1) {
        const a = point(column, row);
        const b = point(column + 1, row);
        const c = point(column + (row & 1) - 1, row + 1);
        const d = point(column + (row & 1), row + 1);
        for (const [first, second, third, seed] of [[a,b,d,2],[a,d,c,3]]) {
          const shade = grain(column, row, seed);
          if (shade < .22) continue;
          ctx.beginPath();
          ctx.moveTo(...first);
          ctx.lineTo(...second);
          ctx.lineTo(...third);
          ctx.closePath();
          ctx.fillStyle = shade > .91 ? tileLight : tile;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(...b);
        ctx.lineTo(...a);
        ctx.lineTo(...c);
        ctx.moveTo(...a);
        ctx.lineTo(...d);
        ctx.lineWidth = 3.7;
        ctx.strokeStyle = halo;
        ctx.stroke();
        ctx.lineWidth = .85;
        ctx.strokeStyle = line;
        ctx.stroke();
      }
    }
    ctx.restore();
    canvas.dataset.ready = 'true';
  }

  function schedule() {
    if (!pending) pending = requestAnimationFrame(draw);
  }
  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);
  schedule();
  return () => {
    observer.disconnect();
    if (pending) cancelAnimationFrame(pending);
  };
}
