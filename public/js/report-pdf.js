/* Self-contained election PDF exporter. No third-party CDN or npm package required.
 * Standard PDF 1.4, embedded text operators and WinAnsi Helvetica fonts.
 * This is intended for aggregate election reports, never individual ballots.
 */
(function (global) {
    'use strict';
    const PAGE_WIDTH = 595.28, PAGE_HEIGHT = 841.89, PAD = 44, RIGHT = PAGE_WIDTH - PAD;
    const printableWidth = RIGHT - PAD;
    const escape = value => String(value ?? 'Not recorded').replace(/[\\()]/g, '\\$&');
    const normalize = value => String(value ?? 'Not recorded')
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\u2022/g, '*').replace(/\u2026/g, '...')
        .replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7e\u00a0-\u00ff]/g, '?');
    const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const date = value => {
        if (!value) return 'Not recorded';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? normalize(value) : d.toLocaleString('en-PH', {
            timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };
    const percentage = (n, total) => num(total) ? (num(n) / num(total) * 100).toFixed(2) + '%' : '0.00%';
    // Convert WinAnsi characters to single bytes for the built-in PDF Type1 fonts.
    // Transliteration happens above for punctuation unsupported by WinAnsi.
    const latin1 = str => Array.from(str, ch => String.fromCharCode(ch.charCodeAt(0) <= 255 ? ch.charCodeAt(0) : 63)).join('');
    const wrap = (value, limit) => {
        const words = normalize(value).split(/\s+/);
        const lines = []; let line = '';
        for (const word of words) {
            if (!word) continue;
            // Ensure a long ID or candidate string cannot overflow a page.
            const chunks = word.match(new RegExp('.{1,' + limit + '}', 'g')) || [word];
            for (const chunk of chunks) {
                if (line && (line + ' ' + chunk).length > limit) { lines.push(line); line = ''; }
                line = line ? line + ' ' + chunk : chunk;
            }
        }
        if (line) lines.push(line);
        return lines.length ? lines : [''];
    };
    class Document {
        constructor() { this.pages = []; this.page = null; this.y = 0; this.newPage(); }
        newPage() {
            this.page = [];
            this.pages.push(this.page);
            this.y = 73;
            this.rectangle(0, 0, PAGE_WIDTH, 12, '0.09 0.40 0.24');
            this.write('GUIMBA BHW MULTIPURPOSE VOTING SYSTEM', PAD, 37, 11, true, '0.09 0.40 0.24');
            this.rule(49);
        }
        rectangle(x, yTop, w, h, color) {
            this.page.push(color + ' rg ' + x.toFixed(2) + ' ' + (PAGE_HEIGHT - yTop - h).toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f');
        }
        rule(y = this.y, color = '0.83 0.87 0.85') {
            this.page.push(color + ' RG 0.6 w ' + PAD + ' ' + (PAGE_HEIGHT-y).toFixed(2) + ' m ' + RIGHT.toFixed(2) + ' ' + (PAGE_HEIGHT-y).toFixed(2) + ' l S');
        }
        write(value, x = PAD, y = this.y, size = 10, bold = false, rgb = '0.14 0.20 0.25') {
            const cleaned = latin1(escape(normalize(value)));
            this.page.push('BT ' + rgb + ' rg /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf 1 0 0 1 ' + x.toFixed(2) + ' ' + (PAGE_HEIGHT - y).toFixed(2) + ' Tm (' + cleaned + ') Tj ET');
        }
        ensure(space) { if (this.y + space > PAGE_HEIGHT - 71) this.newPage(); }
        text(value, opts={}) {
            const size = opts.size || 10;
            const maxChars = opts.maxChars || Math.floor(printableWidth / (size * .53));
            const lines = wrap(value, maxChars);
            const leading = size + 5;
            for (const line of lines) {
                this.ensure(leading);
                this.write(line, opts.x ?? PAD, this.y, size, opts.bold || false, opts.color || '0.14 0.20 0.25');
                this.y += leading;
            }
            if(opts.after) this.y += opts.after;
        }
        section(title) {
            this.ensure(32); this.y += 9;
            this.rectangle(PAD, this.y-14, printableWidth, 24, '0.91 0.95 0.92');
            this.write(title, PAD+8, this.y+2, 11, true, '0.09 0.40 0.24'); this.y+=26;
        }
        table(headers, rows, ratios) {
            const weights = ratios || headers.map(() => 1);
            const sum = weights.reduce((a,b)=>a+b,0);
            const widths = weights.map(w=>printableWidth*w/sum);
            const offsets = [PAD]; widths.forEach(w=>offsets.push(offsets[offsets.length-1]+w));
            const render = (cells, head) => {
                const chunks = cells.map((value,i)=>wrap(value, Math.max(5, Math.floor((widths[i]-11)/(head?5.3:4.8)))));
                const h = Math.max(24, Math.max(...chunks.map(x=>x.length))*12+11);
                this.ensure(h+3);
                if (head) this.rectangle(PAD,this.y-12,printableWidth,h,'0.86 0.91 0.88');
                else if ((this.tableStripe++ % 2) === 0) this.rectangle(PAD,this.y-12,printableWidth,h,'0.97 0.98 0.97');
                chunks.forEach((list,i)=>list.forEach((part,j)=>this.write(part,offsets[i]+5,this.y+j*12,head?9:8.6,head)));
                this.y += h;
                this.rule(this.y-12);
            };
            this.tableStripe=0;
            render(headers,true);
            for (const row of rows) render(row,false);
            this.y += 9;
        }
        serialize() {
            for (let i=0;i<this.pages.length;i++) {
                const page=this.pages[i];
                page.push('0.81 0.84 0.83 RG 0.5 w '+PAD+' 42 m '+RIGHT.toFixed(2)+' 42 l S');
                page.push('BT 0.38 0.44 0.48 rg /F1 8 Tf 1 0 0 1 '+PAD+' 29 Tm (Official aggregated results - individual ballots are confidential) Tj ET');
                page.push('BT 0.38 0.44 0.48 rg /F1 8 Tf 1 0 0 1 '+(RIGHT-62).toFixed(2)+' 29 Tm (Page '+(i+1)+' of '+this.pages.length+') Tj ET');
            }
            const objects=[null];
            const add=x=>{ objects.push(x); return objects.length-1; };
            const pagesId=add('');
            const font1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
            const font2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
            const pageIds=[];
            for (const commands of this.pages) {
                const stream=commands.join('\n')+'\n';
                const streamId=add('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
                pageIds.push(add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 '+PAGE_WIDTH+' '+PAGE_HEIGHT+'] /Resources << /Font << /F1 '+font1+' 0 R /F2 '+font2+' 0 R >> >> /Contents '+streamId+' 0 R >>'));
            }
            objects[pagesId]='<< /Type /Pages /Kids ['+pageIds.map(x=>x+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
            const catalogId=add('<< /Type /Catalog /Pages '+pagesId+' 0 R >>');
            let pdf='%PDF-1.4\n%----\n';
            const offsets=[0];
            for(let i=1;i<objects.length;i++) { offsets[i]=pdf.length; pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n'; }
            const start=pdf.length;
            pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
            for(let i=1;i<objects.length;i++) pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
            pdf+='trailer\n<< /Size '+objects.length+' /Root '+catalogId+' 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
            return Uint8Array.from(pdf, ch => ch.charCodeAt(0) & 255);
        }
    }
    function create(report, scope='overall') {
        if(!report || !Array.isArray(report.positions) || !report.areas) throw new Error('Verified election report is incomplete.');
        if(scope!=='overall' && !Object.prototype.hasOwnProperty.call(report.areas,scope)) throw new Error('Invalid area selected.');
        const d=new Document();
        const overall=scope==='overall';
        d.text('OFFICIAL VERIFIED ELECTION RESULTS', {size:17,bold:true,after:5});
        d.text(overall?'OVERALL ELECTION REPORT':'PER-AREA ELECTION REPORT', {size:12,bold:true,color:'0.09 0.40 0.24',after:9});
        d.text('Election: '+normalize(report.title),{bold:true});
        d.text('Election ID: '+normalize(report.electionId));
        d.text('Voting start: '+date(report.start));
        d.text('Voting end: '+date(report.end));
        d.text('Verification status: FINALIZED / VERIFIED');
        if (!overall) d.text('Reporting area: '+normalize(scope),{bold:true});
        d.text('Report generated (Philippine time): '+date(new Date()),{after:5});
        const stats=overall?{registered:report.registered,voted:report.ballots}:report.areas[scope];
        d.section('PARTICIPATION AND TURNOUT');
        d.table(['Registered members','Ballots cast','Turnout'],[[num(stats.registered),num(stats.voted ?? stats.ballots),percentage(stats.voted ?? stats.ballots,stats.registered)]],[2,2,2]);
        d.section('POSITIONS, CANDIDATES, VOTE TOTALS, OUTCOMES');
        for(const p of report.positions) {
            d.text(normalize(p.position)+' - '+num(p.seats)+' seat(s)',{size:11,bold:true,after:3});
            if (p.tieUnresolved) d.text('UNRESOLVED TIE: seats affected by the cutoff tie are not awarded.',{color:'0.62 0.32 0.09',bold:true});
            const ordered=[...(p.candidates||[])].sort((a,b)=>num(b.votes)-num(a.votes));
            d.table(['Rank','Candidate','Votes',overall?'Official outcome':'Result scope'],ordered.map((c,i)=>[i+1,normalize(c.name),num(overall?c.votes:c.areas?.[scope]),overall?normalize(c.outcome):'Area tally only']),[1,4.5,1.2,2.6]);
        }
        if (overall) {
            d.section('AREA-BY-AREA TURNOUT');
            const areas=Object.entries(report.areas).sort(([a],[b])=>a.localeCompare(b));
            d.table(['Area','Registered','Ballots','Turnout'],areas.map(([area,x])=>[area,num(x.registered),num(x.voted),percentage(x.voted,x.registered)]),[3.8,1.5,1.5,1.7]);
            d.section('CANDIDATE VOTE COUNTS BY AREA');
            for(const [area] of areas) {
                d.text('Area: '+normalize(area),{bold:true,after:2});
                for (const p of report.positions) {
                    d.text(normalize(p.position),{bold:true});
                    d.table(['Candidate','Area votes','Overall votes'],(p.candidates||[]).map(c=>[normalize(c.name),num(c.areas?.[area]),num(c.votes)]),[4.7,1.7,1.7]);
                }
            }
        } else {
            d.section('AREA REPORT INTERPRETATION');
            d.text('Area tallies show the selected area only. Official winners are determined by the overall election results, not by area rankings.');
        }
        d.section('COUNTING METHODOLOGY AND AUDIT NOTES');
        d.text(report.methodology || 'Encrypted ballots are counted after custodian-token verification.');
        d.text('Total verified ballot records: '+num(report.ballots));
        d.text('Data source: stored verified election-result snapshot.');
        d.text('Privacy: individual votes, voter identities and decryption keys are excluded.');
        d.text('Unresolved ties are not declared winners pending formal resolution.');
        return d.serialize();
    }
    function download(report, scope='overall') {
        const bytes=create(report,scope);
        const blob=new Blob([bytes],{type:'application/pdf'});
        const url=URL.createObjectURL(blob);
        const base=String(report.electionId || 'Election').replace(/[^a-zA-Z0-9_-]/g,'_');
        const suffix=scope==='overall'?'Overall':('Area_'+scope.replace(/[^a-zA-Z0-9_-]/g,'_'));
        const link=document.createElement('a');link.href=url;link.download='Election_'+base+'_'+suffix+'.pdf';
        document.body.appendChild(link); link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    global.ElectionPDF={create,download};
})(typeof window==='undefined'?globalThis:window);
