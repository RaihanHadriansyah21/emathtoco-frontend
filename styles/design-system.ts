import { theme } from './theme';
import * as motion from './motion';

export const DS = {
  colors: theme.colors,
  glass: theme.glass,
  buttons: theme.buttons,
  spacing: {
    padding: {
      page: 'p-6 lg:p-8',
      card: 'p-5',
      input: 'py-2.5 px-4',
    },
    margin: {
      section: 'space-y-8',
      item: 'space-y-4',
    },
    container: {
      admin: 'max-w-[1600px] mx-auto w-full',
      dosen: 'max-w-6xl mx-auto w-full',
      mahasiswa: 'max-w-3xl mx-auto w-full',
    }
  },
  motion,
};
export type DSType = typeof DS;
