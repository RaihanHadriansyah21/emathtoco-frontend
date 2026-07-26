import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ModalPortal from '@/components/ui/ModalPortal';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

describe('viewport modal portal', () => {
  it('renders against document.body and locks background scrolling while active', async () => {
    const { rerender } = render(
      <ModalPortal active>
        <div data-testid="viewport-dialog">Dialog</div>
      </ModalPortal>,
    );

    await waitFor(() => expect(screen.getByTestId('viewport-dialog').parentElement).toBe(document.body));
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <ModalPortal active={false}>
        <div data-testid="viewport-dialog">Dialog</div>
      </ModalPortal>,
    );

    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });
});
