const _ = require('underscore');
const builder = require('electron-builder');
const del = require('del');
const exec = require('child_process').exec;
const fs = require('fs');
const gulp = require('gulp');
const babel = require('gulp-babel');
const options = require('../gulpfile.js').options;
const path = require('path');
const Q = require('bluebird');
const shell = require('shelljs');
const version = require('../package.json').version;

const type = options.type;
const applicationName = options.wallet ? 'Ethereum Wallet' : 'MistCake';

gulp.task('clean-dist', cb => {
  return del([`./dist_${type}`, './meteor-dapp-wallet'], cb);
});

gulp.task('copy-app-source-files', () => {
  return gulp
    .src(
      [
        'node_modules/**/*',
        './clientBinaries.json',
        './tests/**/*.*',
        `./icons/${type}/*`,
        './sounds/*',
        './errorPages/*',
        'customProtocols.js',
        '!node_modules/electron/',
        '!node_modules/electron/**/*',
        '!./tests/wallet/*',
        '!./tests/mist/*',
        '!./tests/unit/*'
      ],
      {
        base: './'
      }
    )
    .pipe(gulp.dest(`./dist_${type}/app`));
});

gulp.task('transpile-main', () => {
  return gulp
    .src('./main.js')
    .pipe(babel({ presets: ['es2016-node5'] }))
    .pipe(gulp.dest(`./dist_${type}/app`));
});

gulp.task('transpile-modules', () => {
  return gulp
    .src('./modules/**')
    .pipe(babel({ presets: ['es2016-node5'] }))
    .pipe(gulp.dest(`./dist_${type}/app/modules`));
});

gulp.task('copy-build-folder-files', () => {
  return gulp
    .src([`./icons/${type}/*`, './interface/public/images/dmg-background.jpg'])
    .pipe(gulp.dest(`./dist_${type}/build`));
});

gulp.task('switch-production', cb => {
  fs.writeFile(
    `./dist_${type}/app/config.json`,
    JSON.stringify({
      production: true,
      mode: type
    }),
    cb
  );
});

gulp.task('bundling-interface', cb => {
  const bundle = additionalCommands => {
    exec(
      `cd interface \
            && meteor-build-client ${path.join(
              '..',
              `dist_${type}`,
              'app',
              'interface'
            )} -p "" \
            ${additionalCommands}`,
      (err, stdout) => {
        console.log(stdout);
        cb(err);
      }
    );
  };
    // we will force to use local meteor-dapp-wallet and local block chain
    if (true) {
        if (true) {
            console.log('Use local wallet at ../meteor-dapp-wallet/app');
            console.log('Using local blockchain explorer at ../explorer/app');
            bundle(`&& cd ../../meteor-dapp-wallet/app \
                && cp -R ../../meteor-dapp-wallet/build ../../mist/dist_${type}/app/interface/wallet\
                && cp -R ../../explorer/app ../../mist/dist_${type}/app/interface/explorer`);

        } else {
            console.log(`Pulling https://github.com/ethereum/meteor-dapp-wallet/tree/${options.walletSource} "${options.walletSource}" branch...`);
            bundle(`&& cd ../dist_${type} \
                && git clone --depth 1 https://github.com/ethereum/meteor-dapp-wallet.git \
                && cd meteor-dapp-wallet/app \
                && meteor-build-client ../../app/interface/wallet -p "" \
                && cd ../../ \
                && rm -rf meteor-dapp-wallet`);
    }
  } else {
    bundle();
  }
});

gulp.task('copy-i18n', () => {
  return gulp
    .src(['./interface/i18n/*.*', './interface/project-tap.i18n'], {
      base: './'
    })
    .pipe(gulp.dest(`./dist_${type}/app`));
});

gulp.task('build-dist', cb => {
  const appPackageJson = _.extend({}, require('../package.json'), {
    // eslint-disable-line global-require
    name: applicationName.replace(/\s/, ''),
    productName: applicationName,
    description: applicationName,
    homepage: 'https://github.com/ethereum/mist',
    build: {
      appId: `org.ethereum.${type}`,
      asar: true,
      directories: {
        buildResources: '../build',
        output: '../dist'
      },
      linux: {
        category: 'WebBrowser',
        icon: `./app/${type}/icons`,
        target: ['zip']
      },
      win: {
        target: ['zip']
      },
      mac: {
        category: 'public.app-category.productivity'
      },
      dmg: {
        background: '../build/dmg-background.jpg',
        iconSize: 128,
        contents: [
          {
            x: 441,
            y: 448,
            type: 'link',
            path: '/Applications'
          },
          {
            x: 441,
            y: 142,
            type: 'file'
          }
        ]
      }
    }
  });

  fs.writeFileSync(
    path.join(__dirname, `../dist_${type}`, 'app', 'package.json'),
    JSON.stringify(appPackageJson, null, 2),
    'utf-8'
  );

  const targets = [];
  if (options.mac) targets.push(builder.Platform.MAC);
  if (options.win) targets.push(builder.Platform.WINDOWS);
  if (options.linux) targets.push(builder.Platform.LINUX);

  builder
    .build({
      targets: builder.createTargets(targets, null, 'all'),
      projectDir: path.join(__dirname, `../dist_${type}`, 'app'),
      publish: 'never',
      config: {
        afterPack(params) {
          return Q.try(() => {
            shell.cp(
              [
                path.join(__dirname, '..', 'LICENSE'),
                path.join(__dirname, '..', 'README.md'),
                path.join(__dirname, '..', 'AUTHORS'),
                path.join(__dirname, '..', 'genesis.json'),
                path.join(__dirname, '..', 'geth32.exe'),
                path.join(__dirname, '..', 'geth64.exe')
              ],
              params.appOutDir
            );
          });
        }
      }
    })
    .catch(err => {
      throw new Error(err);
    })
    .finally(() => {
      cb();
    });
});

gulp.task('release-dist', done => {
  const distPath = path.join(__dirname, `../dist_${type}`, 'dist');
  const releasePath = path.join(__dirname, `../dist_${type}`, 'release');

  shell.rm('-rf', releasePath);
  shell.mkdir('-p', releasePath);

  const appNameHypen = applicationName.replace(/\s/, '-');
  const appNameNoSpace = applicationName.replace(/\s/, '');
  const versionDashed = version.replace(/\./g, '-');

  const cp = (inputPath, outputPath) => {
    console.info(
      `Copying from ${path.join(distPath, inputPath)} to ${path.join(
        releasePath,
        outputPath
      )}`
    );
    shell.cp(
      path.join(distPath, inputPath),
      path.join(releasePath, outputPath)
    );
  };

  _.each(options.activePlatforms, platform => {
    switch (platform) { // eslint-disable-line default-case
      case 'win':
        cp(
          `${applicationName}-${version}-ia32-win.zip`,
          `${appNameHypen}-win32-${versionDashed}.zip`
        );
        cp(
          `${applicationName}-${version}-win.zip`,
          `${appNameHypen}-win64-${versionDashed}.zip`
        );
        break;
      case 'mac':
        cp(
          `${applicationName}-${version}.dmg`,
          `${appNameHypen}-macosx-${versionDashed}.dmg`
        );
        break;
      case 'linux':
        // .deb have underscore separators
        cp(
          `${appNameNoSpace}_${version}_i386.deb`,
          `${appNameHypen}-linux32-${versionDashed}.deb`
        );
        cp(
          `${appNameNoSpace}_${version}_amd64.deb`,
          `${appNameHypen}-linux64-${versionDashed}.deb`
        );

        // .zip have dash separators
        cp(
          `${appNameNoSpace}-${version}-ia32.zip`,
          `${appNameHypen}-linux32-${versionDashed}.zip`
        );
        cp(
          `${appNameNoSpace}-${version}.zip`,
          `${appNameHypen}-linux64-${versionDashed}.zip`
        );
        break;
    }
  });

  console.info('∆∆∆ Listing release files ***');
  console.info(shell.ls('-l', releasePath).map(e => e.name));

  done();
});

gulp.task('build-nsis', done => {
  if (!options.win) return done();

  const typeString = `-DTYPE=${type}`;
  const appNameString = `-DAPPNAME=${applicationName.replace(/\s/, '-')}`;
  const versionParts = version.split('.');
  const versionString = `-DVERSIONMAJOR=${versionParts[0]} -DVERSIONMINOR=${
    versionParts[1]
  } -DVERSIONBUILD=${versionParts[2]}`;

  const cmdString = `makensis ${versionString} ${typeString} ${appNameString} scripts/windows-installer.nsi`;

  exec(cmdString, done);
});
