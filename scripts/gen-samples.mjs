import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "assets", "samples");
mkdirSync(outDir, { recursive: true });

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260904);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const miss = (p) => rnd() < p;

const stores = ["台北旗艦店", "台中新光店", "高雄漢神店", "台北車站店", "桃園機場店"];
const sales = ["王小明", "陳美玲", "李大華", "張雅婷", "劉俊傑", "林淑芬"];
const categories = ["3C 家電", "生活用品", "服飾配件", "美妝保養", "食品禮盒"];
const regions = ["北區", "中區", "南區", "東區"];

const rows = ["日期,門市,業務員,產品類別,銷售數量,單價,折扣,客戶評分,是否會員,地區"];
const start = new Date(2026, 0, 1).getTime();
for (let i = 0; i < 600; i++) {
  const d = new Date(start + Math.floor(rnd() * 240) * 86400000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const qty = 1 + Math.floor(rnd() * 20);
  const price = (Math.round(rnd() * 980) + 20) * 10;
  const discount = miss(0.18) ? "NA" : (rnd() * 0.3).toFixed(2);
  const score = miss(0.25) ? "" : String(1 + Math.floor(rnd() * 5));
  const member = rnd() < 0.6 ? "TRUE" : "FALSE";
  const region = miss(0.1) ? "未知" : pick(regions);
  const store = miss(0.05) ? "N/A" : pick(stores);
  rows.push([date, store, pick(sales), pick(categories), qty, price, discount, score, member, region].join(","));
}
writeFileSync(join(outDir, "sample-utf8.csv"), "\uFEFF" + rows.join("\r\n"), "utf8");

const rnd2 = mulberry32(777);
const pick2 = (arr) => arr[Math.floor(rnd2() * arr.length)];
const depts = ["工程部", "行銷部", "人資部", "財務部", "客服部"];
const titles = ["專員", "資深專員", "主管", "經理"];
const educations = ["大學", "碩士", "博士", "專科"];
const cities = ["台北市", "新北市", "台中市", "台南市", "高雄市", "新竹市"];

const rows2 = ["員工編號,姓名,部門,職稱,學歷,到職日,月薪,績效分數,加班時數,居住城市"];
const names = ["陳OO", "林OO", "黃OO", "張OO", "李OO", "吳OO", "劉OO", "蔡OO", "楊OO", "許OO"];
const start2 = new Date(2018, 0, 1).getTime();
for (let i = 0; i < 240; i++) {
  const id = `E${String(1000 + i)}`;
  const d = new Date(start2 + Math.floor(rnd2() * 3000) * 86400000);
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  const salary = 32000 + Math.floor(rnd2() * 60) * 1000;
  const perf = rnd2() < 0.15 ? "缺" : (50 + rnd2() * 50).toFixed(1);
  const ot = rnd2() < 0.2 ? "-" : String(Math.floor(rnd2() * 40));
  const city = rnd2() < 0.08 ? "" : pick2(cities);
  rows2.push([id, pick2(names), pick2(depts), pick2(titles), pick2(educations), date, salary, perf, ot, city].join(","));
}
writeFileSync(join(outDir, "sample-big5.utf8.tmp.csv"), rows2.join("\r\n"), "utf8");
console.log("sample files generated");
