import { parseSettingsFile } from './settingsFile';

const validFile = () => ({
  userSettings: {
    general: { language: 'en', darkMode: false, displayName: '' },
    mapOptions: {
      centerOnResize: false,
      autoBranchColors: true,
      showLinktext: false,
      branchStyle: 'curved',
      fontMaxSize: 70,
      fontMinSize: 15,
      fontIncrement: 5,
      defaultNode: {
        name: '',
        link: { href: '' },
        image: { src: '', size: 60 },
        colors: { name: '#666666', background: '#f5f5f5', branch: '#546e7a' },
        font: { size: 22, style: 'normal', weight: 'normal' },
      },
      rootNode: {
        name: 'Root node',
        link: { href: '' },
        image: { src: '', size: 70 },
        colors: { name: '#666666', background: '#f5f5f5' },
        font: { size: 26, style: 'normal', weight: 'normal' },
      },
    },
  },
});

describe('parseSettingsFile', () => {
  it('returns the user settings of a valid file', () => {
    const file = validFile();

    expect(parseSettingsFile(file, 'test.json')).toEqual(file.userSettings);
  });

  it('rejects a file with system settings', () => {
    const file = { ...validFile(), systemSettings: {} };

    expect(() => parseSettingsFile(file, 'test.json')).toThrow(
      'Invalid settings file test.json'
    );
  });

  it('rejects an unknown branch style and names the field', () => {
    const file = validFile();
    file.userSettings.mapOptions.branchStyle = 'zigzag';

    expect(() => parseSettingsFile(file, 'test.json')).toThrow(
      'userSettings.mapOptions.branchStyle'
    );
  });

  it('rejects a color that is no hex color', () => {
    const file = validFile();
    file.userSettings.mapOptions.rootNode.colors.background = 'red';

    expect(() => parseSettingsFile(file, 'test.json')).toThrow(
      'userSettings.mapOptions.rootNode.colors.background'
    );
  });

  it('rejects a file that lacks a field', () => {
    const partial = { mapOptions: validFile().userSettings.mapOptions };

    expect(() =>
      parseSettingsFile({ userSettings: partial }, 'test.json')
    ).toThrow('userSettings.general');
  });

  it('rejects an unsupported language', () => {
    const file = validFile();
    file.userSettings.general.language = 'xx';

    expect(() => parseSettingsFile(file, 'test.json')).toThrow(
      'userSettings.general.language'
    );
  });
});
