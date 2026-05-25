declare module 'exif-parser' {
  export interface ExifTags {
    CreateDate?: number;
    ModifyDate?: number;
    DateTimeOriginal?: number;
    Make?: string;
    Model?: string;
    GPSLatitude?: number;
    GPSLongitude?: number;
    [key: string]: any;
  }

  export interface ExifResult {
    tags: ExifTags;
    imageSize?: {
      width: number;
      height: number;
    };
  }

  export interface Parser {
    parse(): ExifResult;
  }

  export function create(buffer: Buffer): Parser;
}