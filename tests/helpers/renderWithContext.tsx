import React, { Suspense } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';

export interface RenderWithRouterOptions extends Omit<RenderOptions, 'wrapper'> {
  routerProps?: MemoryRouterProps;
}

/**
 * Renders a component wrapped in React.Suspense and MemoryRouter
 * to match lazy-loaded routes and form subcomponents in TriPro ERP.
 */
export function renderWithRouter(
  ui: React.ReactElement,
  options?: RenderWithRouterOptions
) {
  const { routerProps, ...renderOptions } = options || {};
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Suspense fallback={<div data-testid="test-suspense-fallback">loading</div>}>
      <MemoryRouter {...routerProps}>{children}</MemoryRouter>
    </Suspense>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
