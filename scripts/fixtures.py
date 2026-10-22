from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from html import escape
folder=Path('e2e/fixtures');folder.mkdir(parents=True,exist_ok=True)
rows=[['pn','client','family','field','value','use'],['265258072','VW','ESP9-6','Field 0','ESP','Identificação'],['265258072','VW','ESP9-6','Field 1','265258072','Part Number']]
xml_rows=''.join('<row r="'+str(r+1)+'">'+''.join('<c r="'+chr(65+c)+str(r+1)+'" t="inlineStr"><is><t>'+escape(v)+'</t></is></c>' for c,v in enumerate(row))+'</row>' for r,row in enumerate(rows))
parts={
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="References" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+xml_rows+'</sheetData></worksheet>'}
with ZipFile(folder/'reference.xlsx','w',ZIP_DEFLATED) as z:
 for name,content in parts.items():z.writestr(name,'<?xml version="1.0" encoding="UTF-8"?>'+content)
