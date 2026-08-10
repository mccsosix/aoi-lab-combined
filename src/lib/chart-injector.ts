/**
 * XLSX chart injector - Post-process ExcelJS buffer via ZIP manipulation
 * to add real line charts using OOXML drawing/chart parts.
 */
import JSZip from 'jszip';

export interface ChartDef {
  sheetName: string;
  chartTitle: string;
  qvRange: string;     // "Sheet!B6:B29"
  cpRange: string;     // "Sheet!D6:D29"
  catRange: string;    // "Sheet!A6:A29" (x-axis categories)
  /** 0-based column index for anchor top-left (A=0, B=1, ...) */
  anchorFromCol?: number;
  /** 0-based row index for anchor top-left (row 1 = 0, row 2 = 1, ...) */
  anchorFromRow?: number;
}

/** Wrap sheet name in single quotes when it contains non-alphanum or starts with digit */
function quoteSheetName(name: string): string {
  if (/[^\w\u4e00-\u9fff]/.test(name) || /^\d/.test(name)) {
    return `'${name}'`;
  }
  return name;
}

/** Fix formula reference: "Sheet!range" → "'Sheet'!range" when sheet needs quoting */
function quoteFormula(formula: string): string {
  const bang = formula.indexOf('!');
  if (bang === -1) return formula;
  return `${quoteSheetName(formula.substring(0, bang))}!${formula.substring(bang + 1)}`;
}

export async function injectCharts(xlsxBuffer: ArrayBuffer, charts: ChartDef[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(xlsxBuffer);

  const sheetIndex = await buildSheetIndex(zip);

  const chartsBySheet = new Map<number, ChartDef[]>();
  for (const c of charts) {
    let idx = sheetIndex.get(c.sheetName);
    if (idx === undefined) idx = sheetIndex.get(c.sheetName.replace(/[\/\\?*\[\]]/g, '_'));
    if (idx === undefined) continue;
    if (!chartsBySheet.has(idx)) chartsBySheet.set(idx, []);
    chartsBySheet.get(idx)!.push(c);
  }

  if (chartsBySheet.size === 0) return xlsxBuffer;

  const chartXmls: string[] = charts.map(c => buildLineChart(c));

  for (let ci = 0; ci < charts.length; ci++) {
    zip.file(`xl/charts/chart${ci + 1}.xml`, chartXmls[ci]);
  }

  for (const [sheetNum, sheetCharts] of chartsBySheet) {
    const drawRelId = `rIdChartDraw`;
    const chartFileIdxs = sheetCharts.map(c => charts.indexOf(c));
    const drawingXml = buildDrawingRel(chartFileIdxs, charts);
    const drawPath = `xl/drawings/drawing${sheetNum + 1}.xml`;
    zip.file(drawPath, drawingXml);

    const drawRels = chartFileIdxs.map((gi, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${gi + 1}.xml"/>`);
    const drawRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawRels.join('')}</Relationships>`;
    zip.file(`xl/drawings/_rels/drawing${sheetNum + 1}.xml.rels`, drawRelsXml);

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

    const sheetPath = `xl/worksheets/sheet${sheetNum + 1}.xml`;
    let sheetXml = await zip.file(sheetPath)?.async('string') || '';
    if (!sheetXml.includes('<drawing')) {
      sheetXml = sheetXml.replace('</worksheet>',
        `<drawing r:id="${drawRelId}"/></worksheet>`);
      zip.file(sheetPath, sheetXml);
    }
  }

  let ctXml = await zip.file('[Content_Types].xml')?.async('string') || '';
  const overrides: string[] = [];
  for (const n of chartsBySheet.keys()) {
    const part = `/xl/drawings/drawing${n + 1}.xml`;
    if (!ctXml.includes(`PartName="${part}"`)) {
      overrides.push(`<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    }
  }
  for (let i = 0; i < charts.length; i++) {
    const part = `/xl/charts/chart${i + 1}.xml`;
    if (!ctXml.includes(`PartName="${part}"`)) {
      overrides.push(`<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
    }
  }
  if (overrides.length) {
    ctXml = ctXml.replace('</Types>', overrides.join('') + '</Types>');
    zip.file('[Content_Types].xml', ctXml);
  }

  return await zip.generateAsync({ type: 'arraybuffer' });
}

async function buildSheetIndex(zip: JSZip): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const wbXml = await zip.file('xl/workbook.xml')?.async('string');
    if (!wbXml) return map;
    const sheetTags = wbXml.match(/<sheet\b[^>]*>/g);
    if (!sheetTags) return map;
    let idx = 0;
    for (const tag of sheetTags) {
      const nameM = tag.match(/name="([^"]*)"/);
      if (nameM) map.set(nameM[1], idx);
      idx++;
    }
  } catch (_) { /* ignore */ }
  return map;
}

function buildLineChart(c: ChartDef): string {
  const qvRange = quoteFormula(c.qvRange);
  const cpRange = quoteFormula(c.cpRange);
  const catRange = quoteFormula(c.catRange);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="zh-CN" sz="1100" b="1"/><a:t>${escXml(c.chartTitle)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/><c:order val="0"/>
          <c:tx><c:v>QV</c:v></c:tx>
          <c:spPr><a:ln w="22225"><a:solidFill><a:srgbClr val="5B9BD5"/></a:solidFill></a:ln></c:spPr>
          <c:marker><c:symbol val="none"/></c:marker>
          <c:smooth val="0"/>
          <c:cat><c:numRef><c:f>${escXml(catRange)}</c:f></c:numRef></c:cat>
          <c:val><c:numRef><c:f>${escXml(qvRange)}</c:f></c:numRef></c:val>
        </c:ser>
        <c:ser>
          <c:idx val="1"/><c:order val="1"/>
          <c:tx><c:v>CCD+</c:v></c:tx>
          <c:spPr><a:ln w="22225"><a:solidFill><a:srgbClr val="ED7D31"/></a:solidFill></a:ln></c:spPr>
          <c:marker><c:symbol val="none"/></c:marker>
          <c:smooth val="0"/>
          <c:cat><c:numRef><c:f>${escXml(catRange)}</c:f></c:numRef></c:cat>
          <c:val><c:numRef><c:f>${escXml(cpRange)}</c:f></c:numRef></c:val>
        </c:ser>
        <c:marker val="0"/>
        <c:axId val="100"/>
        <c:axId val="200"/>
      </c:lineChart>
      <c:catAx>
        <c:axId val="100"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:majorTickMark val="none"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="200"/>
        <c:numFmt formatCode="0" sourceLinked="0"/>
        <c:majorUnit val="1"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="200"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
        <c:majorTickMark val="none"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="100"/>
        <c:numFmt formatCode="0.00" sourceLinked="0"/>
      </c:valAx>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
      <c:txPr>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="zh-CN"/></a:p>
      </c:txPr>
    </c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function buildDrawingRel(chartFileIdxs: number[], allCharts: ChartDef[]): string {
  const anchors = chartFileIdxs.map((gi, i) => {
    const c = allCharts[gi]!;

    let fromCol: number, fromRow: number;
    if (c.anchorFromCol !== undefined && c.anchorFromRow !== undefined) {
      fromCol = c.anchorFromCol;
      fromRow = c.anchorFromRow;
    } else {
      fromCol = (gi % 2) * 6 + 4;
      fromRow = Math.floor(gi / 2) * 18;
    }

    const CHART_WIDTH_CM = 10.6;
    const CHART_HEIGHT_CM = 6;
    const cx = Math.round(CHART_WIDTH_CM * 360000);
    const cy = Math.round(CHART_HEIGHT_CM * 360000);

    return `  <xdr:oneCellAnchor>
    <xdr:from>
      <xdr:col>${fromCol}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${fromRow}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="${cx}" cy="${cy}"/>
    <xdr:graphicFrame>
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="${i + 11}" name="Chart ${gi + 1}"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="${cx}" cy="${cy}"/>
      </xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:oneCellAnchor>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchors.join('\n')}
</xdr:wsDr>`;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
