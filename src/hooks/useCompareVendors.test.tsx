import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompareVendors } from "./useCompareVendors";

describe("useCompareVendors", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty", () => {
    const { result } = renderHook(() => useCompareVendors());
    expect(result.current.ids).toEqual([]);
    expect(result.current.isCompared("a")).toBe(false);
  });

  it("adds + removes ids via toggle", () => {
    const { result } = renderHook(() => useCompareVendors());

    act(() => result.current.toggle("a"));
    expect(result.current.ids).toEqual(["a"]);
    expect(result.current.isCompared("a")).toBe(true);

    act(() => result.current.toggle("b"));
    expect(result.current.ids).toEqual(["a", "b"]);

    act(() => result.current.toggle("a"));
    expect(result.current.ids).toEqual(["b"]);
  });

  it("caps at MAX_COMPARE (4) by replacing oldest", () => {
    const { result } = renderHook(() => useCompareVendors());
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("c"));
    act(() => result.current.toggle("d"));
    expect(result.current.ids).toEqual(["a", "b", "c", "d"]);

    act(() => result.current.toggle("e"));
    expect(result.current.ids).toEqual(["b", "c", "d", "e"]);
    expect(result.current.isCompared("a")).toBe(false);
    expect(result.current.isCompared("e")).toBe(true);
  });

  it("clear empties the list", () => {
    const { result } = renderHook(() => useCompareVendors());
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
  });

  it("persists across hook re-mounts via localStorage", () => {
    const { result: r1 } = renderHook(() => useCompareVendors());
    act(() => r1.current.toggle("x"));
    act(() => r1.current.toggle("y"));

    const { result: r2 } = renderHook(() => useCompareVendors());
    expect(r2.current.ids).toEqual(["x", "y"]);
  });

  it("syncs across hook instances when one toggles", () => {
    const { result: r1 } = renderHook(() => useCompareVendors());
    const { result: r2 } = renderHook(() => useCompareVendors());

    act(() => r1.current.toggle("z"));
    expect(r2.current.ids).toEqual(["z"]);
  });

  it("recovers from corrupt localStorage", () => {
    window.localStorage.setItem("vendora.compareList", "not-json{[");
    const { result } = renderHook(() => useCompareVendors());
    expect(result.current.ids).toEqual([]);
  });

  it("ignores non-array stored values", () => {
    window.localStorage.setItem("vendora.compareList", '{"foo":"bar"}');
    const { result } = renderHook(() => useCompareVendors());
    expect(result.current.ids).toEqual([]);
  });
});
