import { startTracking } from "../tracking";
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
test("foreground tracking forwards fixes and errors, then removes its subscription", async () => {
  const remove = jest.fn(),
    fix = jest.fn(),
    error = jest.fn();
  let callback: any, failed: any;
  const stop = startTracking(
    {
      requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
      watch: async (c, e) => {
        callback = c;
        failed = e;
        return { remove };
      },
    },
    fix,
    error,
  );
  await tick();
  callback({ latitude: 50, longitude: 19, accuracy: 5 });
  failed();
  expect(fix).toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(
    "Location is unavailable. Check Location Services and try again.",
  );
  stop();
  callback({ latitude: 51, longitude: 19, accuracy: 5 });
  failed();
  expect(fix).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
});
test("a watch that starts after leaving the screen is removed immediately", async () => {
  let resolve: any;
  const remove = jest.fn();
  const promise = new Promise<{ remove: () => void }>((r) => (resolve = r));
  const stop = startTracking(
    {
      requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
      watch: () => promise,
    },
    jest.fn(),
    jest.fn(),
  );
  await tick();
  stop();
  resolve({ remove });
  await tick();
  expect(remove).toHaveBeenCalledTimes(1);
});
test("denied permission and watch startup errors are readable", async () => {
  const error = jest.fn(),
    watch = jest.fn();
  startTracking(
    {
      requestForegroundPermissionsAsync: async () => ({ status: "denied" }),
      watch,
    },
    jest.fn(),
    error,
  );
  await tick();
  expect(watch).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(
    "Location access is off. Allow location to follow your walk.",
  );
  startTracking(
    {
      requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
      watch: async () => {
        throw Error("native stack");
      },
    },
    jest.fn(),
    error,
  );
  await tick();
  expect(error).toHaveBeenLastCalledWith(
    "Location is unavailable. Check Location Services and try again.",
  );
});
test("leaving during permission or rejection suppresses late updates", async () => {
  let resolve: any;
  const permission = new Promise<{ status: string }>((r) => (resolve = r));
  const watch = jest.fn(),
    error = jest.fn();
  const stop = startTracking(
    { requestForegroundPermissionsAsync: () => permission, watch },
    jest.fn(),
    error,
  );
  stop();
  resolve({ status: "granted" });
  await tick();
  expect(watch).not.toHaveBeenCalled();
  let reject: any;
  const fail = new Promise<{ status: string }>((r, e) => (reject = e));
  const stop2 = startTracking(
    { requestForegroundPermissionsAsync: () => fail, watch },
    jest.fn(),
    error,
  );
  stop2();
  reject(Error("late"));
  await tick();
  expect(error).not.toHaveBeenCalled();
});
