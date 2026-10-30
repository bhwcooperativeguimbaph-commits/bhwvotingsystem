// Lightweight local PDF exporter for secret-ballot acceptance receipts.
(function () {
  function exportReceipt() {
    const ref = document.getElementById('receipt-no')?.textContent?.trim();
    if (!ref) { alert('No receipt reference available.'); return false; }
    const values = [
      'GUIMBA BHW VOTING RECEIPT',
      'Your ballot was received.',
      'Confirmation: ' + ref,
      'Date: ' + (document.getElementById('receipt-date')?.textContent || ''),
      'Candidate selections are not included to protect vote secrecy.'
    ];
    const quote = x => String(x).replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&');
    const stream = 'BT /F1 14 Tf 50 750 Td ' + values.map((x,i) => (i ? '0 -34 Td ' : '') + '(' + quote(x) + ') Tj').join(' ') + ' ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'
    ];
    let pdf='%PDF-1.4\n'; const offsets=[0];
    objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
    const start=pdf.length;pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
    offsets.slice(1).forEach(x=>pdf+=String(x).padStart(10,'0')+' 00000 n \n');
    pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
    const url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));
    const link=document.createElement('a');link.href=url;link.download='Guimba_BHW_Receipt.pdf';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    return true;
  }
  window.downloadReceipt = exportReceipt;
})();
