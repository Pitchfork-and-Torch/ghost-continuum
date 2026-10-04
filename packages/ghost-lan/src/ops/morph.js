import { freshState } from '../state.js';
import { derivePorts } from '../topology.js';
import { hiddenMarker } from './masquerade.js';

export function applyGradualMorph(config, state, reason) {
  const phase = state.morphPhase ?? 0;
  const gradual = config.gradualMorph !== false;

  if (!gradual || reason === 'trap' || reason === 'manual') {
    return { ...freshState(config, state.generation + 1), morphPhase: 0, previousPersona: null, previousBuildId: null };
  }

  const nextGen = state.generation + 1;

  if (phase === 0) {
    return {
      ...state,
      generation: nextGen,
      buildId: freshState(config, nextGen).buildId,
      morphPhase: 1,
      previousPersona: state.persona,
      previousBuildId: state.buildId,
      rotatedAt: Date.now(),
      hiddenPath: hiddenMarker(config.siteSeed, nextGen),
    };
  }

  if (phase === 1) {
    const next = freshState(config, nextGen);
    const oldRotating = state.ports.filter((p) => !config.obviousPorts.includes(p));
    const newRotating = derivePorts(config.siteSeed, nextGen, config.rotatingPortCount);
    const overlap = [...new Set([...oldRotating.slice(0, 2), ...newRotating])].slice(0, config.rotatingPortCount);
    return {
      ...next,
      morphPhase: 2,
      previousPersona: state.persona,
      previousBuildId: state.buildId,
      ports: [...config.obviousPorts, ...overlap],
      hiddenPath: hiddenMarker(config.siteSeed, nextGen),
    };
  }

  const next = freshState(config, nextGen);
  return { ...next, morphPhase: 0, previousPersona: null, previousBuildId: null, hiddenPath: hiddenMarker(config.siteSeed, nextGen) };
}