// Vite emits the TanStack server entry during the image build.
declare module "*/dist/server/server.js" {
  const server: { fetch(request: Request): Promise<Response> };

  export default server;
}
