import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ModalPortal from '@/components/ui/ModalPortal';
import ConfirmModal from '@/app/components/ConfirmModal';

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

  it('keeps the confirmation above another open modal and preserves the nested scroll lock', async () => {
    const { rerender } = render(
      <>
        <ModalPortal active>
          <div className="fixed inset-0 z-[100]" data-testid="detail-modal">Detail mahasiswa</div>
        </ModalPortal>
        <ConfirmModal
          isOpen
          onClose={() => undefined}
          onConfirm={() => undefined}
          title="Hapus Mahasiswa dari Kelas"
          message="Konfirmasi penghapusan"
          variant="danger"
        />
      </>,
    );

    const confirmationLayer = await screen.findByTestId('confirm-modal-layer');
    expect(confirmationLayer.parentElement).toBe(document.body);
    expect(confirmationLayer).toHaveClass('z-[130]');
    expect(screen.getByTestId('detail-modal')).toHaveClass('z-[100]');
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <ModalPortal active>
          <div className="fixed inset-0 z-[100]" data-testid="detail-modal">Detail mahasiswa</div>
        </ModalPortal>
        <ConfirmModal
          isOpen={false}
          onClose={() => undefined}
          onConfirm={() => undefined}
          title="Hapus Mahasiswa dari Kelas"
          message="Konfirmasi penghapusan"
          variant="danger"
        />
      </>,
    );

    await waitFor(() => expect(screen.queryByTestId('confirm-modal-layer')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('hidden');
  });
});
