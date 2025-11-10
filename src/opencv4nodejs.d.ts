declare module '@u4/opencv4nodejs' {
  export class Mat {
    empty: boolean;
    rows: number;
    cols: number;
    channels: number;
    
    cvtColor(code: number): Mat;
    applyColorMap(colormap: number): Mat;
    threshold(thresh: number, maxval: number, type: number): Mat;
    splitChannels(): Mat[];
    getDataAsArray(): number[][];
    getData(): Buffer;
    copy(): Mat;
    morphologyEx(kernel: Mat, op: number, anchor: Point2, iterations: number): Mat;
    findContours(mode: number, method: number): Contour[];
    drawRectangle(pt1: Point2, pt2: Point2, color: Vec3, thickness: number): void;
    putText(text: string, org: Point2, fontFace: number, fontScale: number, color: Vec3, thickness: number): void;
    resize(rows: number, cols: number): Mat;
    hconcat(m: Mat): Mat;
    vconcat(m: Mat): Mat;
    bitwiseAnd(mask: Mat): Mat;
    inRange(lowerb: Vec3, upperb: Vec3): Mat;
  }
  
  export class Contour {
    area: number;
    boundingRect(): Rect;
  }
  
  export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  
  export class Point2 {
    constructor(x: number, y: number);
    x: number;
    y: number;
  }
  
  export class Vec3 {
    constructor(v0: number, v1: number, v2: number);
  }
  
  export class Size {
    constructor(width: number, height: number);
    width: number;
    height: number;
  }
  
  export class VideoCapture {
    constructor(device: number | string);
    read(): Mat;
    release(): void;
    reset(): void;
    set(propId: number, value: number): boolean;
    get(propId: number): number;
  }
  
  export class VideoWriter {
    constructor(filename: string, fourcc: number, fps: number, frameSize: Size);
    write(frame: Mat): void;
    release(): void;
    static fourcc(c1: string, c2?: string, c3?: string, c4?: string): number;
  }
  
  export function getStructuringElement(shape: number, ksize: Size): Mat;
  export function imread(filename: string, flags?: number): Mat;
  export function imwrite(filename: string, img: Mat): boolean;
  export function waitKey(delay?: number): number;
  export function imshow(winname: string, mat: Mat): void;
  export function destroyAllWindows(): void;
  export function namedWindow(winname: string, flags?: number): void;
  
  // Constantes
  export const COLOR_BGR2GRAY: number;
  export const COLOR_BGR2HSV: number;
  export const COLOR_GRAY2BGR: number;
  export const COLOR_GRAY2RGBA: number;
  export const COLORMAP_JET: number;
  export const THRESH_BINARY: number;
  export const MORPH_RECT: number;
  export const MORPH_ELLIPSE: number;
  export const MORPH_CROSS: number;
  export const MORPH_OPEN: number;
  export const MORPH_CLOSE: number;
  export const MORPH_DILATE: number;
  export const MORPH_ERODE: number;
  export const RETR_EXTERNAL: number;
  export const RETR_LIST: number;
  export const CHAIN_APPROX_SIMPLE: number;
  export const CHAIN_APPROX_NONE: number;
  export const FONT_HERSHEY_SIMPLEX: number;
  export const CAP_PROP_FRAME_WIDTH: number;
  export const CAP_PROP_FRAME_HEIGHT: number;
  export const CAP_PROP_FPS: number;
  export const CV_8UC3: number;
  export const WINDOW_AUTOSIZE: number;
  
  // Export por defecto
  const cv: {
    Mat: typeof Mat;
    VideoCapture: typeof VideoCapture;
    VideoWriter: typeof VideoWriter;
    Point2: typeof Point2;
    Vec3: typeof Vec3;
    Size: typeof Size;
    Contour: typeof Contour;
    getStructuringElement: typeof getStructuringElement;
    imread: typeof imread;
    imwrite: typeof imwrite;
    waitKey: typeof waitKey;
    imshow: typeof imshow;
    destroyAllWindows: typeof destroyAllWindows;
    namedWindow: typeof namedWindow;
    COLOR_BGR2GRAY: number;
    COLOR_BGR2HSV: number;
    COLOR_GRAY2BGR: number;
    COLORMAP_JET: number;
    THRESH_BINARY: number;
    MORPH_ELLIPSE: number;
    MORPH_OPEN: number;
    MORPH_DILATE: number;
    RETR_EXTERNAL: number;
    CHAIN_APPROX_SIMPLE: number;
    FONT_HERSHEY_SIMPLEX: number;
    CAP_PROP_FRAME_WIDTH: number;
    CAP_PROP_FRAME_HEIGHT: number;
    CAP_PROP_FPS: number;
    CV_8UC3: number;
  };
  
  export default cv;
}