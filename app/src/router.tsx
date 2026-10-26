/**
 * Router 实例创建工厂：组装路由树，挂载全局错误回退与 404 回退组件
 */
import type { ErrorComponentProps } from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";
import { DefaultErrorFallback, NotFoundFallback } from "./components/ErrorFallback";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error, reset }: ErrorComponentProps) => (
      <DefaultErrorFallback error={error} reset={reset} />
    ),
    defaultNotFoundComponent: () => {
      return <NotFoundFallback />;
    },
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
