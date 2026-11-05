const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/**
 * Point an <img> at an MJPEG URL and return a cleanup that really closes the
 * connection (removing the element does not always abort the stream). The URL
 * is set imperatively so React StrictMode's setup→cleanup→setup still works.
 */
export function attachStream(img: HTMLImageElement, url: string, onAttach?: () => void) {
  onAttach?.();
  img.src = url;
  return () => {
    img.src = BLANK;
  };
}
