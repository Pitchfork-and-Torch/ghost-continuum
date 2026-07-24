const SCANNER_UA = /nikto|masscan|zgrab|nmap|sqlmap|acunetix|nessus|openvas|shodan|censys|zmap|dirbuster|gobuster|httpx|feroxbuster/i;
const SCRIPT_UA = /curl|wget|python-requests|go-http-client|java\/|libwww|axios|httpie/i;
const SHODAN_UA = /shodan|censys|internetmeasurement/i;

export function classifyProbe(req) {
  const ua = req.headers['user-agent'] || '';
  const method = req.method || 'GET';
  const url = req.url || '/';

  if (SHODAN_UA.test(ua)) return { class: 'shodan', score: 8 };
  if (SCANNER_UA.test(ua)) return { class: 'scanner', score: 7 };
  if (method === 'HEAD' && !ua) return { class: 'scanner', score: 5 };
  if (SCRIPT_UA.test(ua)) return { class: 'script', score: 3 };
  if (/mozilla|chrome|safari|firefox|edg/i.test(ua)) return { class: 'browser', score: 1 };
  if (!ua) return { class: 'script', score: 4 };
  return { class: 'unknown', score: 2 };
}

export function responseMode(probeClass) {
  if (probeClass === 'scanner' || probeClass === 'shodan') return 'minimal';
  if (probeClass === 'script') return 'bare';
  if (probeClass === 'browser') return 'full';
  return 'standard';
}