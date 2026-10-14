/**
 * DauEnglish moved Part 1 image objects from the legacy `p1/...` folders to
 * optimized `m/<asset-id>/...webp` objects. Keep old snapshots usable while
 * they are being refreshed by translating the known legacy filenames.
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

export function normalizeDauToeicImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/\/storage\/v1\/object\/public\/mock-test-media\/dautoeic\/p1\//.test(url.pathname)) return value;
    const filename = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const asset = PART1_IMAGE_ASSETS[filename];
    if (!asset) return value;
    url.pathname = `/storage/v1/object/public/mock-test-media/m/${asset}/${filename}.w960.webp`;
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}
