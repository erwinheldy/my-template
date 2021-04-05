#!/usr/bin/env node

const fs = require('fs')
const ejs = require('ejs')
const csso = require('csso')
const sass = require('node-sass')
const chalk = require('chalk')
const merge = require('lodash.merge')
const terser = require('terser')
const globby = require('globby')
const server = require('live-server')
const postcss = require('postcss')
const chokidar = require('chokidar')
const beautify = require('js-beautify').html
const autoprefixer = require('autoprefixer')
const { parseHTML } = require('linkedom')
const { resolve, extname, basename, join, parse } = require('path')

const systemConfig = require(join(__dirname, 'config.js'))
const customConfig = fs.existsSync(systemConfig.customConfig) ? require(resolve(systemConfig.customConfig)) : {}
const config = merge(systemConfig, customConfig)

const htmlSrc = config.path.html.src
const htmlDst = config.path.html.dst
const htmlData = join(htmlSrc, 'data.json')
const cssSrc = config.path.css.src
const cssDst = config.path.css.dst
const jsDst = config.path.js.dst
const delay = 200


fs.existsSync(cssDst) === false && fs.mkdirSync(cssDst, { recursive: true })
fs.existsSync(htmlDst) === false && fs.mkdirSync(htmlDst, { recursive: true })


function files(dir, ext) {
  return fs.readdirSync(dir, 'utf-8')
    .filter(i => extname(i) === '.' + ext && i.startsWith('_') === false)
}
function doneIn(start) {
  console.log(chalk.blue('Done in'), new Date() - start, 'ms\n')
}
function argv(key) {
  const arg = process.argv.filter(val => val.startsWith('--' + key))
  return arg.length ? arg.pop().split('=').pop() : null
}
function toMin(src) {
  const obj = parse(src)
  return join(obj.dir, obj.name + '.min' + obj.ext)
}
function toExt(src, ext) {
  const obj = parse(src)
  return join(obj.dir, obj.name + ext)
}
async function copy(src, dst) {
  return await new Promise(resolve => {
    fs.copyFile(src, dst, resolve)
  })
}
async function emptyDir(dir) {
  fs.existsSync(dir) === false && fs.mkdirSync(dir, { recursive: true })
  return await new Promise(resolve => {
    fs.readdirSync(dir, 'utf-8').forEach(file => fs.unlinkSync(join(dir, file)))
    resolve()
  })
}


async function html(file, elapsed = true) {
  return await new Promise(async resolve => {
    const src = join(htmlSrc, file)
    const dst = join(htmlDst, toExt(file, '.html'))

    console.log(chalk.gray('Compiling'), chalk.cyan(src), 'to', chalk.cyan(dst))

    const start = elapsed ? new Date() : 0
    const result = await ejs.renderFile(src, JSON.parse(fs.readFileSync(htmlData, 'utf-8')))

    fs.writeFileSync(dst, result)

    elapsed && doneIn(start)
    resolve()
  })
}
async function htmlAll() {
  await emptyDir(htmlDst)

  const start = new Date()
  await Promise.all(files(htmlSrc, 'ejs').map(file => html(file, false)))
  doneIn(start)
}
async function htmlPartial(target) {
  return await new Promise(async resolve => {
    const start = new Date()
    const partial = parse(target).name
    let targets = []
    files(htmlSrc, 'ejs').forEach(file => {
      let content = fs.readFileSync(join(htmlSrc, file), 'utf-8')
        .match(/include\(\s*(['"])(.+?)\1\s*(,\s*({.+?})\s*)?\)/g)
      content = content ? content.join('') : ''

      if (content.includes(partial + "'") || content.includes(partial + '"')) {
        targets.push(file)
      }
    })
    await Promise.all(targets.map(file => html(file, false)))
    doneIn(start)
    resolve()
  })
}
async function htmlBeautify(file) {
  return await new Promise(async resolve => {
    const src = join(htmlDst, file)
    fs.writeFileSync(src, beautify(fs.readFileSync(src, 'utf-8'), {
      indent_size: 2,
      unformatted: ['pre', 'code'],
    }))
    resolve()
  })
}
async function htmlBeautifyAll() {
  console.log(chalk.gray('Beautifying'), chalk.cyan(join(htmlDst, '*.html')))

  const start = new Date()
  await Promise.all(files(htmlDst, 'html').map(htmlBeautify))
  doneIn(start)
}


async function css(file, elapsed = true) {
  return await new Promise(resolve => {
    const src = join(cssSrc, file)
    const dst = join(cssDst, toExt(file, '.css'))

    console.log(chalk.gray('Compiling'), chalk.cyan(src), 'to', chalk.cyan(dst))

    const start = elapsed ? new Date() : 0
    const result = sass.renderSync({
      file: src,
      outputStyle: 'expanded',
      sourceMap: true,
      outFile: dst,
    })

    fs.writeFileSync(dst, result.css)
    fs.writeFileSync(dst + '.map', result.map)

    elapsed && doneIn(start)
    resolve()
  })
}
async function cssAll() {
  await emptyDir(cssDst)

  const start = new Date()
  await Promise.all(files(cssSrc, 'scss').map(file => css(file, false)))
  doneIn(start)
}
async function cssPartial(target) {
  return await new Promise(async resolve => {
    const start = new Date()
    const partial = parse(target).name.substring(1)

    let targets = []
    files(cssSrc, 'scss').forEach(file => {
      const content = fs.readFileSync(join(cssSrc, file), 'utf-8')
        .split('\n').filter(i => i.startsWith('@import')).join('')

      if (content.includes(partial + "'") || content.includes(partial + '"')) {
        targets.push(file)
      }
    })
    await Promise.all(targets.map(file => css(file, false)))
    doneIn(start)
    resolve()
  })
}
async function cssAutoprefix(file, fromCssDst = true) {
  return await new Promise(async resolve => {
    const src = fromCssDst ? join(cssDst, file) : file
    const content = fs.readFileSync(src, 'utf-8')

    const result = await postcss([autoprefixer]).process(content, {
      from: file,
      map: {
        inline: false,
        annotation: true,
        sourcesContent: true,
      }
    })
    fs.writeFileSync(src, result.css)
    resolve()
  })
}
async function cssMinify(file, fromCssDst = true) {
  return await new Promise(async resolve => {
    const src = fromCssDst ? join(cssDst, file) : file
    const dst = fromCssDst ? join(cssDst, toMin(file)) : toMin(file)
    const content = fs.readFileSync(src, 'utf-8')

    const result = csso.minify(content, {
      restructure: false,
      comments: false,
    })
    fs.writeFileSync(dst, result.css)
    resolve()
  })
}
async function cssAutoprefixMinify() {
  console.log(chalk.gray('Autoprefixing & Minifying'), chalk.cyan(join(cssDst, '*.css')))

  const start = new Date()
  const cssFiles = files(cssDst, 'css').filter(i => i.slice(i.length - 8) !== '.min.css')
  await Promise.all(cssFiles.map(file => cssAutoprefix(file)))
  await Promise.all(cssFiles.map(file => cssMinify(file)))
  doneIn(start)
}


async function setNonMinifiedAttribute(el, attr) {
  return await new Promise(resolve => {
    const src = el.getAttribute(attr)
    switch (attr) {
      case 'href':
        src.endsWith('.min.css') && el.setAttribute(attr, src.slice(0, -7) + 'css')
        break;
      case 'src':
        src.endsWith('.min.js') && el.setAttribute(attr, src.slice(0, -6) + 'js')
        break;
    }
    resolve()
  })
}
async function setMinifiedAttribute(el, attr) {
  return await new Promise(async resolve => {
    await setNonMinifiedAttribute(el, attr)
    const src = el.getAttribute(attr)
    switch (attr) {
      case 'href':
        src.endsWith('.css') && el.setAttribute(attr, src.slice(0, -3) + 'min.css')
        break;
      case 'src':
        src.endsWith('.js') && el.setAttribute(attr, src.slice(0, -2) + 'min.js')
        break;
    }
    resolve()
  })
}
async function setAsset(file, minified = true) {
  return await new Promise(async resolve => {
    const src = join(htmlDst, file)
    const { document } = parseHTML(fs.readFileSync(src, 'utf-8'))

    await Promise.all(
      document.querySelectorAll('link[href]')
        .map(el => minified ? setMinifiedAttribute(el, 'href') : setNonMinifiedAttribute(el, 'href'))
    )
    await Promise.all(
      document.querySelectorAll('script[src]')
        .map(el => minified ? setMinifiedAttribute(el, 'src') : setNonMinifiedAttribute(el, 'src'))
    )

    fs.writeFileSync(src, '<!DOCTYPE html>\n' + document.documentElement.outerHTML)
    resolve()
  })
}
async function setAssetAll(minified = true) {
  console.log(chalk.gray('Adjusting assets'), chalk.cyan(join(htmlDst, '*.html')))

  const start = new Date()
  await Promise.all(files(htmlDst, 'html').map(file => setAsset(file, minified)))
  doneIn(start)
}


async function jsMinify(file, fromJsDst = true) {
  return await new Promise(async resolve => {
    const src = fromJsDst ? join(jsDst, file) : file
    const dst = toMin(src)
    const content = fs.readFileSync(src, 'utf-8')

    const result = await terser.minify(content, {
      format: {
        quote_style: 1,
      }
    })
    fs.writeFileSync(dst, result.code)
    resolve()
  })
}
async function jsMinifyAll() {
  fs.existsSync(jsDst) === false && fs.mkdirSync(jsDst)
  console.log(chalk.gray('Minifying'), chalk.cyan(join(jsDst, '*.js')))

  const start = new Date()
  const jsFiles = files(jsDst, 'js').filter(i => i.slice(i.length - 7) !== '.min.js')
  await Promise.all(jsFiles.map(file => jsMinify(file)))
  doneIn(start)
}


async function lib() {
  const lib = require(resolve('my-template.libraries.js'))
  fs.rmdirSync(lib.dst, { recursive: true })

  console.log(chalk.gray('Copying libraries to'), chalk.cyan(join(lib.dst)))
  await libCopy(lib.lib, lib.dst)

  console.log(chalk.gray('Autoprefixing css files from'), chalk.cyan(join(lib.dst)))
  await libAutoprefixCss(lib.dst)

  console.log(chalk.gray('Minifying css files from'), chalk.cyan(join(lib.dst)))
  await libMinifyCss(lib.dst)

  console.log(chalk.gray('Minifying js files from'), chalk.cyan(join(lib.dst)))
  await libMinifyJs(lib.dst)
}
async function libCopy(libs, dst) {
  return await new Promise(async resolve => {
    for (const [key, value] of Object.entries(libs)) {
      const dstDir = join(dst, key)
      fs.existsSync(dstDir) === false && fs.mkdirSync(dstDir, { recursive: true })

      const files = await globby(value)
      await Promise.all(files.map(file => copy(join(file), join(dstDir, basename(file)))))
    }
    resolve()
  })
}
async function libAutoprefixCss(dst) {
  return await new Promise(async resolve => {
    const files = await globby(join(dst, '**', '*.css'))
    await Promise.all(files.map(file => cssAutoprefix(file, false)))
    resolve()
  })
}
async function libMinifyCss(dst) {
  return await new Promise(async resolve => {
    const files = await globby([join(dst, '**', '*.css'), join('!' + dst, '**', '*.min.css')])
    await Promise.all(files.map(file => cssMinify(file, false)))
    resolve()
  })
}
async function libMinifyJs(dst) {
  return await new Promise(async resolve => {
    const files = await globby([join(dst, '**', '*.js'), join('!' + dst, '**', '*.min.js')])
    await Promise.all(files.map(file => jsMinify(file, false)))
    resolve()
  })
}

void (async () => {

  if (argv('dev')) {
    await setAssetAll(false)
    chokidar.watch(htmlSrc, { ignoreInitial: true }).on('all', (event, target) => {
      setTimeout(async () => {
        if ((event === 'add' || event === 'change') && target !== htmlData) {
          const filename = basename(target)
          filename.startsWith('_') ? await htmlPartial(filename) : await html(filename)
        }
        else {
          await htmlAll()
        }
      }, delay)
    })
    chokidar.watch(cssSrc, { ignoreInitial: true }).on('all', (event, target) => {
      setTimeout(async () => {
        if (event === 'add' || event === 'change') {
          const filename = basename(target)
          filename.startsWith('_') ? await cssPartial(filename) : await css(filename)
        }
        else {
          await cssAll()
        }
      }, delay)
    })
    server.start(config.server)
    console.log(chalk.green(`Serving at http://${config.server.host}:${config.server.port}`))
    console.log(chalk.blue('Ready for changes\n'))
  }
  else if (argv('lib')) {
    const start = new Date()
    await lib()
    doneIn(start)
  }
  else {
    const start = new Date()

    await htmlAll()
    await htmlBeautifyAll()
    await setAssetAll()
    await cssAll()
    await cssAutoprefixMinify()
    await jsMinifyAll()

    console.log(chalk.green('Build finished in'), new Date() - start, 'ms\n')
  }

})()
