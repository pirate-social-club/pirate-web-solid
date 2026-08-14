import { Head, Title } from "@solidjs/meta";
import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
import { QueryClientProvider } from "@tanstack/solid-query";
import { pageRoutes } from "virtual:file-routes";
import { HostContextProvider, readHostContext } from "./lib/host-context";
import { createAppQueryClient } from "./lib/query-client";
import "./index.css";

const Router = createRouter({ routes: fileRoutes(pageRoutes) });

export default function App() {
  const hostContext = readHostContext();
  const queryClient = createAppQueryClient();

  return (
    <HostContextProvider value={hostContext}>
      <QueryClientProvider client={queryClient}>
        <Head>
          <Title>Pirate Web</Title>
          <Router>{props => props.children}</Router>
        </Head>
      </QueryClientProvider>
    </HostContextProvider>
  );
}
