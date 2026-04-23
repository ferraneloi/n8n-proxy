const DASHBOARD_HTML = `
        h += '<div class="card"><strong>' + w.workflowName + '</strong>' + act +
             '<br><small style="color:#94a3b8">Nodo: ' + w.nodeName + '</small>' +
             '<span class="url">' + w.urlProxy + '</span>' +
             '<button class="btn" onclick="navigator.clipboard.writeText(\\'' + w.urlProxy + '\\')">Copiar URL</button></div>';
`;
console.log(DASHBOARD_HTML);
