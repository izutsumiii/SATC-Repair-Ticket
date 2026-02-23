const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'assets', 'js', 'app.js');
let s = fs.readFileSync(filePath, 'utf8');
// Remove duplicate "} else if (resendBtn) {" block that contains the orphaned confirm line
const from = '    } else if (resendBtn) {\n        const username = resendBtn.getAttribute(\'data-username\');\n        if (!username) return;\n        if (!confirm(';
const idx = s.indexOf(from);
if (idx !== -1) {
  const rest = s.slice(idx + from.length);
  const endIdx = rest.indexOf('    } else if (resendBtn) {');
  if (endIdx !== -1) {
    const toRemove = from + rest.slice(0, endIdx);
    s = s.replace(toRemove, '    } else if (resendBtn) {');
  }
}
fs.writeFileSync(filePath, s);
console.log('Done');
