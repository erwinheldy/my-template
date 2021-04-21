# my-template
my template build tools

## Installation
`npm i @erwinheldy/my-template`

## Features
- ejs template
- scss styling
- autoprefixer
- watch & live reload
- libraries copier
- options to use sass(js) or dart-sass

## Commands
package.json:
```json
"scripts": {
  "dev": "my-template --dev",
  "build": "my-template",
  "libraries": "my-template --lib"
}
```

`npm run build`\
`npm run dev`\
`npm run libraries`

## Default configuration
my-template.config.js:
```javascript
module.exports = {
  path: {
    html: {
      src: 'src/ejs',
      dst: 'dist/html',
    },
    css: {
      src: 'src/scss',
      dst: 'dist/css',
    },
    js: {
      dst: 'dist/js',
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    watch: 'dist',
    verbose: false,
  },
  useDartSass: false
}
```
## Example libraries
my-template.libraries.js:
```javascript
module.exports = {
  dst: 'dist/lib',
  lib: {
    'bootstrap': 'node_modules/bootstrap/dist/js/bootstrap.bundle.j*',
    'jquery': ['node_modules/jquery/dist/jquery.js', 'node_modules/jquery/dist/jquery.slim.js'],
    'photoswipe': ['node_modules/photoswipe/dist/*', '!node_modules/photoswipe/dist/*.min.js'],
    'photoswipe/default-skin': 'node_modules/photoswipe/dist/default-skin',
  }
}
```
