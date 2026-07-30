/**
 * XLSX chart injector - Post-process ExcelJS buffer via ZIP manipulation
 * to add real scatter/line charts using OOXML drawing/chart parts.
 */
import JSZip from 'jszip';

export interface ChartDef {
  sheetName: string;
  chartTitle: string;
  qvRange: string;     // "Sheet!B6:B29"
  cpRange: string;     // "Sheet!D6:D29"
  catRange: string;    // "Sheet!A6:A29" (x-axis categories)
}

export async function injectCharts(xlsxBuffer: ArrayBuffer, charts: ChartDef[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(xlsxBuffer);

  // Step 1: Build sheet name → index map from workbook.xml
  const sheetIndex = await buildSheetIndex(zip);

  // Step 2: Group charts by sheet
  const chartsBySheet = new Map<number, ChartDef[]>();
  for (const c of charts) {
    const idx = sheetIndex.get(c.sheetName) ?? sheetIndex.get(c.sheetName.replace(/[\/\\?*\[\]]/g, '_'));
    if (idx === undefined) continue;
    if (!chartsBySheet.has(idx)) chartsBySheet.set(idx, []);
    chartsBySheet.get(idx)!.push(c);
  }

  if (chartsBySheet.size === 0) return xlsxBuffer;

  // Step 3: Create chart XML parts (one per chart)
  const chartXmls: string[] = [];
  for (const c of charts) {
    chartXmls.push(buildScatterChart(c));
  }

  // Step 4: Add chart files to ZIP
  for (let ci = 0; ci < charts.length; ci++) {
    zip.file(`xl/charts/chart${ci + 1}.xml`, chartXmls[ci]);
  }

  // Step 5: Build drawing XML per sheet
  for (const [sheetNum, sheetCharts] of chartsBySheet) {
    const drawRelId = `rIdChartDraw`;
    const drawingXml = buildDrawingRel(sheetCharts, charts);
    const drawPath = `xl/drawings/drawing${sheetNum + 1}.xml`;
    zip.file(drawPath, drawingXml);

    // Drawing relationships (chart refs)
    const drawRels: string[] = [];
    let chartIdx = 0;
    for (let ci = 0; ci < charts.length; ci++) {
      const c = charts[ci];
      const idx = sheetIndex.get(c.sheetName) ?? -1;
      if (idx !== sheetNum) continue;
      chartIdx++;
      drawRels.push(`<Relationship Id="rId${chartIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${ci + 1}.xml"/>`);
    }
    const drawRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawRels.join('')}</Relationships>`;
    zip.file(`xl/drawings/_rels/drawing${sheetNum + 1}.xml.rels`, drawRelsXml);

    // Sheet rels (add drawing reference)
    const sheetRelsPath = `xl/worksheets/_rels/sheet${sheetNum + 1}.xml.rels`;
    let sheetRels = await zip.file(sheetRelsPath)?.async('string') || '';
    if (!sheetRels) {
      sheetRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    }
    if (!sheetRels.includes('/drawing')) {
      sheetRels = sheetRels.replace('</Relationships>',
        `<Relationship Id="${drawRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${sheetNum + 1}.xml"/></Relationships>`);
    }
    zip.file(sheetRelsPath, sheetRels);

    // Sheet XML (add drawing element)
    const sheetPath = `xl/worksheets/sheet${sheetNum + 1}.xml`;
    let sheetXml = await zip.file(sheetPath)?.async('string') || '';
    if (!sheetXml.includes('<drawing')) {
      sheetXml = sheetXml.replace('</worksheet>',
        `<drawing r:id="${drawRelId}"/></worksheet>`);
      zip.file(sheetPath, sheetXml);
    }
  }

  // Step 6: Update Content_Types.xml
  let ctXml = await zip.file('[Content_Types].xml')?.async('string') || '';
  if (!ctXml.includes('drawing+xml')) {
    const extraDrawings: string[] = [];
    const extraCharts: string[] = [];
    for (const n of chartsBySheet.keys()) {
      if (n > 0) extraDrawings.push(`<Override PartName="/xl/drawings/drawing${n + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    }
    for (let i = 1; i < charts.length; i++) {
      extraCharts.push(`<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
    }
    ctXml = ctXml.replace('</Types>',
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
      extraDrawings.join('') +
      '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>' +
      extraCharts.join('') +
      '</Types>');
  }
  zip.file('[Content_Types].xml', ctXml);

  return await zip.generateAsync({ type: 'arraybuffer' });
}

async function buildSheetIndex(zip: JSZip): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const wbXml = await zip.file('xl/workbook.xml')?.async('string');
    if (!wbXml) return map;
    const matches = wbXml.match(/<sheet\s+[^>]*name="([^"]*)"\s+sheetId="(\d+)"/g);
    if (!matches) return map;
    let idx = 0;
    for (const m of matches) {
      const nameM = m.match(/name="([^"]*)"/);
      if (nameM) map.set(nameM[1], idx);
      idx++;
    }
  } catch (_) { /* ignore */ }
  return map;
}

function buildScatterChart(c: ChartDef): string {
  const [shQv, qvRng] = parseRef(c.qvRange);
  const [shCp, cpRng] = parseRef(c.cpRange);
  const [shCat, catRng] = parseRef(c.catRange);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:p><a:r><a:rPr lang="zh-CN" b="1" sz="1000"/><a:t>${escXml(c.chartTitle)}</a:t></a:r></a:p></c:rich></c:tx>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:scatterChart>
        <c:scatterStyle val="lineMarker"/>
        <c:varyColors val="false"/>
        <c:ser>
          <c:idx val="0"/><c:order val="0"/>
          <c:tx><c:strRef><c:f>${escXml(shQv)}!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>QV</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:spPr><a:ln w="22000"><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></a:ln></c:spPr>
          <c:marker><c:symbol val="none"/></c:marker>
          <c:xVal><c:numRef><c:f>${escXml(catRng)}</c:f></c:numRef></c:xVal>
          <c:yVal><c:numRef><c:f>${escXml(qvRng)}</c:f></c:numRef></c:yVal>
        </c:ser>
        <c:ser>
          <c:idx val="1"/><c:order val="1"/>
          <c:tx><c:strRef><c:f>${escXml(shCp)}!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>CCD+</c:v></c:pt></c:strCache></c:strRef></c:tx>
          <c:spPr><a:ln w="22000"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill></a:ln></c:spPr>
          <c:marker><c:symbol val="none"/></c:marker>
          <c:xVal><c:numRef><c:f>${escXml(catRng)}</c:f></c:numRef></c:xVal>
          <c:yVal><c:numRef><c:f>${escXml(cpRng)}</c:f></c:numRef></c:yVal>
        </c:ser>
      </c:scatterChart>
      <c:valAx>
        <c:axId val="100"/><c:delete val="0"/>
        <c:spPr><a:ln><a:noFill/></a:ln></c:spPr>
        <c:majorGridlines><c:spPr><a:ln w="6000"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
      </c:valAx>
      <c:valAx>
        <c:axId val="200"/><c:delete val="0"/>
        <c:spPr><a:ln><a:noFill/></a:ln></c:spPr>
        <c:crossAx val="100"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/></c:legend>
  </c:chart>
</c:chartSpace>`;
}

function buildDrawingRel(sheetCharts: ChartDef[], allCharts: ChartDef[]): string {
  const anchors = sheetCharts.map((c, i) => {
    const globalIdx = allCharts.indexOf(c);
    const col = (globalIdx % 2) * 6 + 4;
    const row = Math.floor(globalIdx / 2) * 18;
    return `  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>${col}</xdr:col><xdr:row>${row}</xdr:row></xdr:from>
    <xdr:to><xdr:col>${col + 7}</xdr:col><xdr:row>${row + 18}</xdr:row></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="${globalIdx + 11}" name="Chart ${globalIdx + 1}"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="500000" y="500000"/><a:ext cx="5200000" cy="3600000"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${globalIdx + 1}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${anchors.join('\n')}
</xdr:wsDr>`;
}

function parseRef(ref: string): [string, string] {
  const p = ref.indexOf('!');
  return p >= 0 ? [ref.slice(0, p), ref.slice(p + 1)] : [ref, ref];
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
