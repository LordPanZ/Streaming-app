# Recursos de empaquetado

`electron-builder` busca aquí los iconos de la aplicación:

| Archivo | Sistema | Requisito |
|---|---|---|
| `icon.icns` | macOS | 512×512 como mínimo |
| `icon.ico` | Windows | multirresolución, hasta 256×256 |
| `icon.png` | Linux | 512×512 |

Sin ellos el empaquetado funciona igualmente y se usa el icono por defecto de
Electron. Para sustituirlos basta con dejar los archivos en esta carpeta.
