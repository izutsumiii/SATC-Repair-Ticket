/**
 * Client-side repair ticket receipt (A4, jsPDF).
 * Depends on window.jspdf.jsPDF (loaded from CDN in index.php).
 */
(function () {
    function fmt(v) {
        if (v == null || String(v).trim() === '') return '—';
        return String(v).trim();
    }

    function fmtDate(v) {
        if (!v) return '—';
        const s = String(v);
        if (s.indexOf('T') !== -1) return s.split('T')[0];
        return s;
    }

    function safeFilenamePart(s) {
        return String(s || 'ticket').replace(/[^\w.-]+/g, '_').slice(0, 80);
    }

    window.generateTicketReceiptPdf = function (ticket) {
        if (!ticket) return;
        
        // #region agent log - receipt uses location-field keys
        try {
            fetch('http://127.0.0.1:7607/ingest/b3bba1b6-94ec-4a1d-9a60-edd9561a01ed', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Debug-Session-Id': '7b9856'
                },
                body: JSON.stringify({
                    sessionId: '7b9856',
                    location: 'assets/js/receipt-pdf.js:generateTicketReceiptPdf',
                    message: 'Receipt generator received location fields',
                    hypothesisId: 'H3_pdf_binding',
                    data: {
                        ticket_id: ticket.ticket_id,
                        ticket_id_form: ticket.ticket_id_form,
                        cluster: ticket.cluster,
                        municipality: ticket.municipality,
                        longlat: ticket.longlat,
                        latitude: ticket.latitude,
                        longitude: ticket.longitude
                    },
                    timestamp: Date.now()
                })
            }).catch(() => {});
        } catch (e) {}
        // #endregion
        
        var jspdf = window.jspdf;
        if (!jspdf || !jspdf.jsPDF) {
            console.error('jsPDF not loaded');
            return;
        }

        var JsPDF = jspdf.jsPDF;
        var doc = new JsPDF({ unit: 'mm', format: 'a4' });
        var pageW = doc.internal.pageSize.getWidth();
        var pageH = doc.internal.pageSize.getHeight();
        var margin = 14;
        var y = margin;

        function hr(yPos) {
            doc.setDrawColor(224, 224, 224);
            doc.line(margin, yPos, pageW - margin, yPos);
        }

        function sectionTitle(text, yPos) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(60, 60, 60);
            doc.text(text, margin, yPos);
            hr(yPos + 1.5);
            return yPos + 6;
        }

        function drawField(label, value, xLabel, xValue, widthValue, yPos) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(85, 85, 85);
            doc.text(label, xLabel, yPos);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(25, 25, 25);
            var lines = doc.splitTextToSize(fmt(value), widthValue);
            doc.text(lines, xValue, yPos);
            return Math.max(5.2, lines.length * 4.2) + 1.1;
        }

        // Header
        doc.setFillColor(196, 30, 58);
        doc.rect(0, 0, pageW, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('SATC | Surf2Sawa', margin, 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Repair Ticket Receipt', margin, 17);
        doc.setFontSize(7.5);
        doc.text('Generated from Repair Ticketing System', margin, 22);

        // Hero row
        y = 36;
        doc.setFillColor(248, 248, 248);
        doc.rect(margin, y, pageW - margin * 2, 18, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(8);
        doc.text('TICKET NUMBER', margin + 3, y + 5);
        doc.text('JO NUMBER', margin + 96, y + 5);
        doc.setFontSize(13);
        doc.setTextColor(20, 20, 20);
        doc.text(fmt(ticket.ticket_id_form), margin + 3, y + 12.5);
        doc.text(fmt(ticket.ticket_id), margin + 96, y + 12.5);
        y += 24;

        // Customer and location
        y = sectionTitle('Customer & Location', y);
        var leftLabel = margin;
        var leftVal = margin + 35;
        var rightLabel = margin + 102;
        var rightVal = margin + 132;
        var leftW = 62;
        var rightW = pageW - rightVal - margin;
        var rowH = 0;

        rowH = Math.max(
            drawField('Customer', ticket.customer_name, leftLabel, leftVal, leftW, y),
            drawField('Account No.', ticket.account_number, rightLabel, rightVal, rightW, y)
        );
        y += rowH;
        rowH = Math.max(
            drawField('Contact', ticket.contact_num, leftLabel, leftVal, leftW, y),
            drawField('Municipality', ticket.municipality, rightLabel, rightVal, rightW, y)
        );
        y += rowH;
        y += drawField('Address', ticket.address, leftLabel, leftVal, pageW - leftVal - margin, y);
        rowH = Math.max(
            drawField('Cluster', ticket.cluster, leftLabel, leftVal, leftW, y),
            drawField('LongLat', ticket.longlat, rightLabel, rightVal, rightW, y)
        );
        y += rowH + 2;

        // Service details
        y = sectionTitle('Service Details', y);
        y += drawField('Date Created', fmtDate(ticket.date_created), leftLabel, leftVal, leftW, y);
        y += drawField('Issue', ticket.issue, leftLabel, leftVal, pageW - leftVal - margin, y);
        y += drawField('Description', ticket.description, leftLabel, leftVal, pageW - leftVal - margin, y);

        // Status and dates
        if (y > pageH - 60) {
            doc.addPage();
            y = margin;
        }
        y += 1;
        y = sectionTitle('Assignment & Timeline', y);
        rowH = Math.max(
            drawField('Status', ticket.status, leftLabel, leftVal, leftW, y),
            drawField('Risk Level', ticket.risk_level, rightLabel, rightVal, rightW, y)
        );
        y += rowH;
        rowH = Math.max(
            drawField('Team', ticket.team, leftLabel, leftVal, leftW, y),
            drawField('Technician', ticket.technician, rightLabel, rightVal, rightW, y)
        );
        y += rowH;
        rowH = Math.max(
            drawField('Date Started', fmtDate(ticket.date_started), leftLabel, leftVal, leftW, y),
            drawField('1st Dispatch', fmtDate(ticket.first_dispatch), rightLabel, rightVal, rightW, y)
        );
        y += rowH;
        y += drawField('Date Completed', fmtDate(ticket.date_completed), leftLabel, leftVal, leftW, y);
        y += drawField('Remarks', ticket.remarks, leftLabel, leftVal, pageW - leftVal - margin, y);

        // Footer
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(110, 110, 110);
        doc.text('Generated: ' + fmtDate(new Date().toISOString()), margin, pageH - 9);
        doc.text('This document reflects data stored in the system at export time.', margin, pageH - 5);

        var name = 'S2S-Receipt-' + safeFilenamePart(ticket.ticket_id_form) + '-' + safeFilenamePart(ticket.ticket_id) + '.pdf';
        doc.save(name);
    };
})();
