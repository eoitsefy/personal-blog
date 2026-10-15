import sharp from "sharp";

export const PRIVATE_PHOTO_MARKER = "PRIVATE_PHOTO_AUTHOR";
export const PRIVATE_PHOTO_XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="12,34.56N" exif:GPSLongitude="98,7.06E"/></rdf:RDF></x:xmpmeta>';

// Generated test data only; no real photographs, locations or account data.
export async function privatePhotoFixture(format: "jpeg" | "png" | "webp", orientation = 6) {
  const pixels = Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0,
    255, 255, 0, 255, 0, 255, 255, 64, 255, 0, 255, 255,
  ]);
  const image = sharp(pixels, { raw: { width: 3, height: 2, channels: 4 } })
    .withExif({
      IFD0: { Artist: PRIVATE_PHOTO_MARKER, Make: "PRIVATE_CAMERA", DateTime: "2026:10:15 01:23:45" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 34/1 56/1", GPSLongitudeRef: "E", GPSLongitude: "98/1 7/1 6/1" },
    })
    .withXmp(PRIVATE_PHOTO_XMP)
    .withMetadata({ orientation });
  if (format === "jpeg") return image.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
  if (format === "webp") return image.webp({ lossless: true, exact: true }).toBuffer();
  return image.png().toBuffer();
}
