import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';

import { ThreeCarDemoController, type ThreeCarDemoViewState } from './threeCarDemoController';

const ThreeCarDemoContext = createContext<ThreeCarDemoController | null>(null);

export function ThreeCarDemoProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() => new ThreeCarDemoController());
  useEffect(() => () => controller.dispose(), [controller]);
  return <ThreeCarDemoContext.Provider value={controller}>{children}</ThreeCarDemoContext.Provider>;
}

export function useThreeCarDemo(): { controller: ThreeCarDemoController; state: ThreeCarDemoViewState } {
  const controller = useContext(ThreeCarDemoContext);
  if (!controller) throw new Error('useThreeCarDemo must be used inside ThreeCarDemoProvider.');
  return { controller, state: useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot) };
}
