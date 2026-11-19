/**
 * DauEnglish moved Part 1 image objects from the legacy `p1/...` folders to
 * optimized `m/<asset-id>/...webp` objects or local `/media/dauenglish/*.webp`
 * CDN mirrors. Keep old snapshots usable while they are being refreshed by
 * translating all 70 known legacy filenames.
 */
const PART1_IMAGE_ASSETS: Record<string, string> = {
  "1790571273990.jpg": "9b85c99167814ad2a47d1106303d8e96",
  "1790583847706.jpg": "7962301c47db4c2ca8956ce1d3d7efcd",
  "1790577054877.jpg": "d8865ba2de2c4fdd88eb2fbaa85e71ce",
  "1790449200274.jpg": "4480c667644544eab965ae302c6966ed",
  "1790606887423.jpg": "8ed18f771a6b4f0fbac201bc5d2805e9",
  "1790577230861.jpg": "8266328842d048879c9c17d6357ffba5",
  "1790449230106.jpg": "8482034c246e4bb6918718c3b358ec8c",
  "1790449229984.jpg": "2a554bfa764e4a4c96e9d9a6fc39772f",
  "1790571269545.jpg": "ee9d5a544bc74845ad28a9a5011ddc79",
  "1790571270315.jpg": "917a670e63f643acb5618e7fc2b5cbaa",
  "1790449227787.jpg": "7e35256c283a4bb5b4205395b064a07b",
  "1790449229704.jpg": "f55801f823534750af64f3a4c933e4e7",
  "1790449306133.jpg": "2b45e2d0c8fa46fcb3b3a815327b669c",
  "1790449307457.jpg": "2e7241d74c424c55b9da7f68b482fb90",
  "1790617326093.jpg": "7a7a72a460784bf49df4325b0bff1626",
  "1790449305415.jpg": "eec34a85f17f47739c2ea50bacc2f279",
  "1790571269571.jpg": "a31be196934f4395a76aa946e069e9e9",
  "1790571269006.jpg": "9f713ca9a60349a3b0f1864d74316e8b",
  "1790449332876.jpg": "0306220657de4582ad282bc660256c3d",
  "1790449329339.jpg": "006ebf6fd5674da3853d719dd710492f",
  "1790449330019.jpg": "e6bacb78217f42f58f86cb9b284e370e",
  "1790449332181.jpg": "cc4378007c244544a6e3f4d8b010e608",
  "1790449331283.jpg": "c382108c547241f190a18155fa97f774",
  "1790571268615.jpg": "195535c181524eda9ecee861ad7d9a02",
};

const PART1_LOCAL_MIRROR_ASSETS: Record<string, string> = {
  "1790422529101.jpg": "/media/dauenglish/17f2f24ff1e867b6.webp",
  "1790423923366.jpg": "/media/dauenglish/5af2e79d3e53f12e.webp",
  "1790425120554.jpg": "/media/dauenglish/ae72d069fa5769e9.webp",
  "1790425121782.jpg": "/media/dauenglish/9eba6124a21bebbe.webp",
  "1790425122351.jpg": "/media/dauenglish/c187c3007e13d66b.webp",
  "1790425246221.jpg": "/media/dauenglish/00868333655b2316.webp",
  "1790425833297.jpg": "/media/dauenglish/b56c5f89d7607d36.webp",
  "1790426517038.jpg": "/media/dauenglish/6864ecdde6a335e7.webp",
  "1790426517763.jpg": "/media/dauenglish/3a1370af62393477.webp",
  "1790427412065.jpg": "/media/dauenglish/7e367703634c0a0e.webp",
  "1790427899341.jpg": "/media/dauenglish/57a172081aa13615.webp",
  "1790427899521.jpg": "/media/dauenglish/77e00b77d9f7769a.webp",
  "1790437576056.jpg": "/media/dauenglish/ec6cdd43661a0ec2.webp",
  "1790437576701.jpg": "/media/dauenglish/5100a1f38d54cb27.webp",
  "1790437578471.jpg": "/media/dauenglish/882c40c9a55add1b.webp",
  "1790437580425.jpg": "/media/dauenglish/973f27b0199c79ff.webp",
  "1790441785788.jpg": "/media/dauenglish/301fb78bf830ffd3.webp",
  "1790441786269.jpg": "/media/dauenglish/25400abec1fae41f.webp",
  "1790441786460.jpg": "/media/dauenglish/22b7019a066ead17.webp",
  "1790441786710.jpg": "/media/dauenglish/fff4a99d0d86af81.webp",
  "1790441787274.jpg": "/media/dauenglish/b7609ccc54b28998.webp",
  "1790441787540.jpg": "/media/dauenglish/2ee204a2de0f864b.webp",
  "1790579410290.jpg": "/media/dauenglish/6dcc3b02ea2c51df.webp",
  "1790579410345.jpg": "/media/dauenglish/cfb04c7fb815281d.webp",
  "1790579411071.jpg": "/media/dauenglish/ccec5c2a51672f6f.webp",
  "1790579411992.jpg": "/media/dauenglish/3433a44085e72333.webp",
  "1790579429024.jpg": "/media/dauenglish/36a5b2be87ba7339.webp",
  "1790579431192.jpg": "/media/dauenglish/2de40fea09365b17.webp",
  "1790579432060.jpg": "/media/dauenglish/80157f23923ff707.webp",
  "1790579449319.jpg": "/media/dauenglish/e58f6faae6b22d8b.webp",
  "1790579451114.jpg": "/media/dauenglish/0425f2e2530b960a.webp",
  "1790579453347.jpg": "/media/dauenglish/a106ac4abb2a44b5.webp",
  "1790579460830.jpg": "/media/dauenglish/4d01c3a1caba7ef6.webp",
  "1790579472070.jpg": "/media/dauenglish/8e7bf7b694a9f961.webp",
  "1790579473109.jpg": "/media/dauenglish/dfb164c1a5b2aeda.webp",
  "1790579474615.jpg": "/media/dauenglish/211d64fce80e9dea.webp",
  "1790579479078.jpg": "/media/dauenglish/36a2951565d10aeb.webp",
  "1790579754482.jpg": "/media/dauenglish/13de43cca24d0211.webp",
  "1790579755253.jpg": "/media/dauenglish/445c0bcef3e113f1.webp",
  "1790579755330.jpg": "/media/dauenglish/1e32b7f91cad9ce1.webp",
  "1790579761121.jpg": "/media/dauenglish/68486e00f164afb3.webp",
  "1790579882096.jpg": "/media/dauenglish/b052d9f60111b0f1.webp",
  "1790581499238.jpg": "/media/dauenglish/d3873ac708a259cc.webp",
  "1790581500275.jpg": "/media/dauenglish/6bbbc2217d583bd9.webp",
  "1790581501266.jpg": "/media/dauenglish/6ea4d11c1a63532f.webp",
  "1790581501776.jpg": "/media/dauenglish/77e86fe47b697883.webp",
};

export function normalizeDauToeicImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/media/dauenglish/")) return value;
  try {
    const url = new URL(value);
    if (!/\/storage\/v1\/object\/public\/mock-test-media\/dautoeic\/p1\//.test(url.pathname)) return value;
    const filename = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const localMirror = PART1_LOCAL_MIRROR_ASSETS[filename];
    if (localMirror) return localMirror;
    const asset = PART1_IMAGE_ASSETS[filename];
    if (!asset) return value;
    url.pathname = `/storage/v1/object/public/mock-test-media/m/${asset}/${filename}.w960.webp`;
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}
