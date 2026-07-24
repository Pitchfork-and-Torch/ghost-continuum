export function renderReplayPanel(container, timeline) {
  if (!timeline?.branches?.length) {
    container.innerHTML = '<div class="meta">No replay data — interact with honeypots first</div>';
    return;
  }

  let branchIdx = 0;
  let step = 0;

  function draw() {
    const branch = timeline.branches[branchIdx];
    const ev = branch?.events?.[step];
    container.innerHTML = `
      <div class="meta" style="margin-bottom:.5rem">
        Branch <strong>${branchIdx + 1}/${timeline.branches.length}</strong> ·
        Step <strong>${step + 1}/${branch?.events?.length || 0}</strong>
        ${branch?.forkReason ? `· fork: ${branch.forkReason}` : ''}
      </div>
      ${ev ? `
        <div class="event">
          <div><span class="event-type ${ev.plane || 'hub'}">${ev.type}</span> · ${ev.ip || '—'}</div>
          <div class="event-ts">${new Date(ev.ts).toLocaleString()} · score ${ev.score ?? 0}</div>
          <div class="meta" style="margin-top:.35rem">persona: ${ev.detail?.persona || ev.persona || '—'}</div>
        </div>
      ` : '<div class="meta">End of branch</div>'}
      <div style="display:flex;gap:.5rem;margin-top:.75rem">
        <button class="primary" id="rpPrev">◀ Prev</button>
        <button class="primary" id="rpNext">Next ▶</button>
        <button id="rpBranch">Next branch</button>
      </div>
    `;
    container.querySelector('#rpPrev')?.addEventListener('click', () => {
      if (step > 0) step--;
      else if (branchIdx > 0) { branchIdx--; step = Math.max(0, (timeline.branches[branchIdx].events?.length || 1) - 1); }
      draw();
    });
    container.querySelector('#rpNext')?.addEventListener('click', () => {
      const max = branch.events?.length || 0;
      if (step < max - 1) step++;
      else if (branchIdx < timeline.branches.length - 1) { branchIdx++; step = 0; }
      draw();
    });
    container.querySelector('#rpBranch')?.addEventListener('click', () => {
      branchIdx = (branchIdx + 1) % timeline.branches.length;
      step = 0;
      draw();
    });
  }

  draw();
}