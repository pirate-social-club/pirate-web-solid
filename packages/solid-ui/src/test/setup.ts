import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.setPointerCapture = () => {};
  }
  window.scrollTo = () => {};
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }

  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      bottom: 4,
      height: 4,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
}

