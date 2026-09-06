import { beforeEach, describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
import { analyze } from "../src/core/analyze";
import { DEFAULT_OPTIONS } from "../src/core/types";
import { chartDataUrl } from "../src/ui/charts";
import { buildReportHtml, buildStatsCsv } from "../src/ui/report";

vi.mock("../src/ui/charts", () => ({
  chartDataUrl: vi.fn(() => "data:image/png;base64,dGVzdA=="),
  PALETTE: ["red", "green", "blue", "gray", "black", "cyan"],
}));

function sampleResult() {
  return analyze({
    name: 'data<&".csv',
    columnNames: ['score<&"', "amount", 'city,\"name\"\nline', "date"],
    columns: [
      ["1", "2", "NA", "4"],
      ["2", "4", "6", "8"],
      ['<script>"A",B\r\nC&</script>', '<script>"A",B\r\nC&</script>', "other", "other2"],
      ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
    ],
    rowCount: 4,
  }, DEFAULT_OPTIONS);
}

beforeEach(() => vi.clearAllMocks());

describe("buildReportHtml", () => {
  it("產生完整報告並將各圖表嵌為圖片", () => {
    const html = buildReportHtml(sampleResult(), { source: "clipboard", encoding: "UTF-8" });
    expect(html).toContain('<html lang="zh-Hant">');
    for (const label of ["缺失值總覽", "分布分析", "相關性（Pearson）", "缺失模式熱力圖", "常見缺失組合", "UTF-8", "4 列 × 4 欄"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/<img src="data:image\/png;base64,dGVzdA=="\/>/g)).toHaveLength(7);
    expect(vi.mocked(chartDataUrl).mock.calls.map(([id]) => id)).toEqual([
      "rep-missing-bar", "rep-heat", "rep-corr", 'rep-hist-score<&"', "rep-hist-amount", 'rep-cat-city,"name"\nline', "rep-date-date",
    ]);
  });

  it("跳脫檔名、來源、編碼、欄名、類別及缺失組合中的 HTML", () => {
    const html = buildReportHtml(sampleResult(), { source: '<img src="x">&', encoding: '<utf"&>' });
    expect(html).toContain("data&lt;&amp;&quot;.csv");
    expect(html).toContain("score&lt;&amp;&quot;");
    expect(html).toContain("&lt;img src=&quot;x&quot;&gt;&amp;");
    expect(html).toContain("&lt;utf&quot;&amp;&gt;");
    expect(html).toContain("&lt;script&gt;&quot;A&quot;,B\r\nC&amp;&lt;/script&gt;");
    expect(html).toContain("<td>score&lt;&amp;&quot;</td><td>1</td><td>25.0%</td>");
    expect(html).not.toContain("<script>");
  });

  it("空資料省略不存在的圖表與缺失組合", () => {
    const result = analyze({ name: "empty", columnNames: [], columns: [], rowCount: 0 }, DEFAULT_OPTIONS);
    const html = buildReportHtml(result, { source: "empty", encoding: null });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("常見缺失組合");
    expect(html).not.toContain("相關性（Pearson）");
    expect(html).not.toContain("編碼：");
  });
});

describe("buildStatsCsv", () => {
  it("保留 UTF-8 BOM、CRLF、完整欄名及數值精度", () => {
    const csv = buildStatsCsv(sampleResult());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith('\uFEFF#,欄位,型別,缺失數,缺失率%,不重複值,平均數,中位數,標準差,最小值,最大值,類別數,最高類別\r\n')).toBe(true);
    const rows = Papa.parse<string[]>(csv).data;
    expect(rows[1]).toEqual(["1", 'score<&"', "integer", "1", "25.00", "3", "2.3333333", "2.0000000", "1.5275252", "1.0000000", "4.0000000", "3", "1"]);
    expect(rows).toHaveLength(5);
  });

  it("逗號、引號與換行可透過 CSV parser 還原", () => {
    const csv = buildStatsCsv(sampleResult());
    const rows = Papa.parse<string[]>(csv).data;
    expect(csv).toContain('"city,""name""\nline"');
    expect(rows[3][1]).toBe('city,"name"\nline');
    expect(rows[3][12]).toBe('<script>"A",B\r\nC&</script>');
    expect(rows[3].slice(6, 11)).toEqual(["", "", "", "", ""]);
    expect(rows[3][11]).toBe("3");
  });
});
