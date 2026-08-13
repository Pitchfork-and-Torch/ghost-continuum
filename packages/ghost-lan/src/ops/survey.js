import { classifyProbe, responseMode } from './classify.js';
import { recordDossier } from './dossier.js';

export function surveyProbe(req, ip, context = {}) {
  const probe = classifyProbe(req);
  const headers = { ...req.headers };
  delete headers.cookie;
  delete headers.authorization;

  const survey = {
    ip,
    probeClass: probe.class,
    probeScore: probe.score,
    mode: responseMode(probe.class),
    method: req.method,
    url: req.url,
    ua: req.headers['user-agent'] || '',
    accept: req.headers.accept || '',
    referer: req.headers.referer || '',
    headerCount: Object.keys(req.headers).length,
    port: context.port,
    ruleId: context.ruleId || null,
    persona: context.persona || null,
    firstSurvey: !context.returning,
  };

  recordDossier(ip, {
    probeClass: probe.class,
    probeScore: Math.max(probe.score, context.threatScore || 0),
    lastUrl: req.url,
    lastUa: survey.ua,
    seenGenerations: context.seenGenerations,
    surveys: context.returning ? undefined : [survey],
  });

  return survey;
}