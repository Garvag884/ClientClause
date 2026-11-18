import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';
import { pathToFileURL } from 'node:url';

const ROOT = '/Users/garv/ClientClause';
const SKILL_DIR = '/Users/garv/.codex/plugins/cache/openai-primary-runtime/presentations/26.1117.11355/skills/presentations';
const BUILD = path.join(ROOT, '.codex-pitch-build');
const OUTDIR = path.join(ROOT, 'pitch_deck_output');
const FINAL = path.join(OUTDIR, 'ClientClause-pitch-deck-polished.pptx');
const C = { paper:'#F5F3EF', white:'#FCFBF9', ink:'#1C2D39', navy:'#263C4D', muted:'#677176', gold:'#A38A5B', rule:'#DAD8D2', pale:'#EDEAE2' };
const F = { serif:'Georgia', sans:'Arial' };
const p = Presentation.create({ slideSize:{width:1280,height:720} });

function shape(slide, name, x, y, w, h, fill='none', stroke='none', sw=0, geom='textbox') {
  return slide.shapes.add({ geometry:geom, name, position:{left:x,top:y,width:w,height:h}, fill, line:{style:'solid',fill:stroke,width:sw} });
}
function text(slide, name, value, x, y, w, h, opts={}) {
  const s=shape(slide,name,x,y,w,h);
  s.text=value;
  s.text.style={fontSize:opts.size??'18pt',typeface:opts.font??F.sans,color:opts.color??C.ink,bold:opts.bold??false,italic:opts.italic??false,alignment:opts.align??'left',verticalAlignment:opts.valign??'top',wrap:'square',autoFit:'shrinkText',insets:opts.insets??{top:0,right:0,bottom:0,left:0},...opts.style};
  return s;
}
function line(slide,x,y,w,color=C.rule,h=1) { shape(slide,'divider',x,y,w,h,color); }
async function addImage(slide,file,x,y,w,h,alt,fit='contain') {
  const b=await fs.readFile(file);
  const ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  slide.images.add({blob:ab,contentType:'image/png',alt,fit,position:{left:x,top:y,width:w,height:h}});
}
function base(bg=C.paper){const s=p.slides.add();s.background.fill=bg;return s;}
function header(slide,label,title,subtitle=''){
  text(slide,'section-label',label.toUpperCase(),72,44,820,24,{size:'11pt',bold:true,color:C.gold});
  text(slide,'slide-title',title,72,80,1136,110,{font:F.serif,size:'34pt',color:C.ink});
  if(subtitle)text(slide,'slide-subtitle',subtitle,74,190,1100,44,{size:'17pt',color:C.muted});
}
function note(slide,txt){slide.speakerNotes.text=txt;}

// Cover
{
 const s=base();
 line(s,72,72,88,C.gold,3);
 await addImage(s,path.join(ROOT,'frontend/logo.png'),72,104,70,70,'ClientClause brand mark');
 text(s,'brand-name','ClientClause',160,112,620,62,{font:F.sans,size:'25pt',bold:true,color:C.ink,valign:'middle'});
 text(s,'cover-title','Good agreements begin\nwith clarity.',72,244,1050,188,{font:F.serif,size:'45pt',color:C.ink});
 text(s,'cover-subtitle','AI-assisted contract drafting for freelancers and small businesses in India',76,460,830,78,{size:'20pt',color:C.muted});
 line(s,76,590,1128,C.rule,1);
 text(s,'cover-context','STARTUP PITCH DECK',76,612,770,24,{size:'11pt',bold:true,color:C.gold});
 text(s,'cover-author','Project by Garv Agarwala',76,652,740,27,{size:'14pt',color:C.muted});
 note(s,'ClientClause is an AI-assisted drafting prototype described in the project README. The README lists Garv Agarwala as the project author.');
}

// Problem and solution
{
 const s=base();
 header(s,'01  Problem and proposed solution','Small teams still need clear terms before work begins','ClientClause turns a plain-language deal description into a draft with visible gaps and checks.');
 const y0=284;
 const items=[
  ['01','Starting from a blank page','People must translate a deal into terms such as scope, payment, revisions, ownership, and termination.'],
  ['02','Templates leave gaps','A generic form can miss details that matter to this specific project or relationship.'],
  ['03','Polished text can hide uncertainty','General AI may omit information or silently fill gaps without a clear checklist.'],
 ];
 items.forEach((it,i)=>{
  const y=y0+i*112;
  text(s,`problem-no-${i}`,it[0],74,y,60,32,{font:F.serif,size:'19pt',italic:true,color:C.gold});
  text(s,`problem-title-${i}`,it[1],150,y-2,380,40,{size:'20pt',bold:true,color:C.navy});
  text(s,`problem-body-${i}`,it[2],560,y-4,630,66,{size:'16pt',color:C.muted});
  if(i<2)line(s,150,y+82,1038,C.rule,1);
 });
 line(s,74,636,1130,C.gold,2);
 text(s,'solution-line','Proposed response: describe the deal, start from a clause library, check the details, then edit and export.',74,655,1125,40,{size:'15pt',bold:true,color:C.ink});
 note(s,'Problem statements are product hypotheses taken from ClientClause’s README and positioning. They are not yet validated by customer interviews or measured outcome data. The solution description reflects current project documentation: AI classifies the request and extracts facts; agreement wording comes from the project clause library; deterministic checks flag blanks, assumptions, and invalid values; users can adjust selected clause variants and print or save a PDF.');
}

// Market research
{
 const s=base();
 header(s,'02  Market opportunity and research','A broad market, with a focused first customer segment','India’s workforce counts show context, not a revenue estimate for ClientClause.');
 text(s,'metric-a','7.34 crore',78,292,470,90,{font:F.serif,size:'39pt',color:C.navy});
 text(s,'metric-a-caption','unincorporated non-agricultural establishments\nIndia, ASUSE 2023–24',82,390,470,68,{size:'17pt',color:C.muted});
 text(s,'metric-a-detail','Includes manufacturing, trade, and services. Many are outside ClientClause’s likely early customer segment.',82,478,472,74,{size:'14pt',color:C.muted});
 shape(s,'market-divider',622,282,1,292,C.rule);
 text(s,'metric-b','23.5 million',690,292,510,90,{font:F.serif,size:'39pt',color:C.navy});
 text(s,'metric-b-caption','gig and platform workers projected\nby NITI Aayog for 2029–30',694,390,490,68,{size:'17pt',color:C.muted});
 text(s,'metric-b-detail','NITI’s 2022 estimate starts from 7.7 million workers in 2020–21. This is a dated projection, not a current headcount.',694,478,490,74,{size:'14pt',color:C.muted});
 shape(s,'market-wedge-band',72,586,1136,82,C.navy);
 text(s,'market-wedge','START WITH',98,607,150,22,{size:'10pt',bold:true,color:'#D9C49A'});
 text(s,'market-wedge-copy','Freelancers and small service businesses that need repeatable agreements. The populations may overlap, so do not add them.',270,600,904,48,{size:'14pt',color:C.white});
 note(s,'Sources and interpretation:\n1) Ministry of Statistics and Programme Implementation (MoSPI), Annual Survey of Unincorporated Sector Enterprises 2023–24. The report estimates about 7.34 crore establishments in the unincorporated non-agricultural sector (October 2023–September 2024). https://www.mospi.gov.in/sites/default/files/publication_reports/ASUSE_2023_24_Full_Report-L.pdf\n2) NITI Aayog, India’s Booming Gig and Platform Economy (June 2022), estimates 7.7 million gig workers in 2020–21 and projects 23.5 million by 2029–30. It is a dated forecast and includes platform work beyond ClientClause’s likely initial professional-services segment. https://www.niti.gov.in/sites/default/files/2022-06/25th_June_Final_Report_27062022.pdf\nThe figures describe different, potentially overlapping populations. They are market context only, not a calculated addressable market or revenue forecast. Customer acquisition, willingness to pay, and usage frequency remain unvalidated.');
}

// Target audience and persona
{
 const s=base();
 header(s,'03  Target audience and customer persona','The first customer hypothesis is a solo service professional','Illustrative persona, informed by the project’s example workflow. It is not based on completed customer research.');
 text(s,'persona-name','Riya Sharma',76,286,440,60,{font:F.serif,size:'30pt',color:C.navy});
 text(s,'persona-role','Freelance web developer in Bengaluru',80,352,510,32,{size:'16pt',color:C.gold});
 line(s,80,408,480,C.rule,1);
 text(s,'persona-task-label','WHEN A CLIENT ENGAGEMENT STARTS',80,432,500,22,{size:'10pt',bold:true,color:C.gold});
 text(s,'persona-task','Her ₹50,000 e-commerce website project needs scope, payment, delivery dates, and ownership in writing before work starts.',80,464,500,124,{font:F.serif,size:'21pt',color:C.ink});
 shape(s,'persona-rule',640,270,1,350,C.rule);
 text(s,'persona-needs-label','WHAT SHE NEEDS',696,286,430,22,{size:'10pt',bold:true,color:C.gold});
 const needs=[
  ['Plain-language start','Describe the deal without knowing legal drafting terms.'],
  ['Visible open points','See missing details and assumptions before using the draft.'],
  ['Control of terms','Adjust wording, then print or save a PDF for review.'],
 ];
 needs.forEach((it,i)=>{
  const y=332+i*92;
  text(s,`persona-need-title-${i}`,it[0],696,y,440,32,{size:'18pt',bold:true,color:C.navy});
  text(s,`persona-need-body-${i}`,it[1],696,y+34,480,48,{size:'14pt',color:C.muted});
 });
 text(s,'persona-caveat','Validate this profile through interviews with freelancers, consultants, and small service firms.',696,614,500,45,{size:'13pt',italic:true,color:C.muted});
 note(s,'Illustrative persona synthesized from the product’s sample scenario in README.md (Riya Sharma, freelance web developer; ₹50,000 project; Bengaluru). It does not describe an interviewed or paying customer. Persona assumptions should be checked through customer discovery.');
}

// MVP / prototype
{
 const s=base();
 header(s,'04  MVP and product prototype','A guided draft, with gaps made visible','The prototype combines a plain-language prompt, a clause library, and deterministic checks.');
 text(s,'mvp-step-label','PRODUCT FLOW',76,276,400,22,{size:'10pt',bold:true,color:C.gold});
 const steps=[
  ['01','Describe the deal','The prompt captures the parties, purpose, and terms in everyday language.'],
  ['02','Draft and check','AI extracts facts; the clause library supplies wording and rules flag gaps.'],
  ['03','Review and export','Edit open fields or clause options, then print or save a PDF.'],
 ];
 steps.forEach((it,i)=>{
  const y=310+i*101;
  text(s,`mvp-no-${i}`,it[0],76,y,55,32,{font:F.serif,size:'18pt',italic:true,color:C.gold});
  text(s,`mvp-title-${i}`,it[1],138,y-2,405,34,{size:'18pt',bold:true,color:C.navy});
  text(s,`mvp-copy-${i}`,it[2],138,y+34,405,56,{size:'14pt',color:C.muted});
 });
 text(s,'mvp-differentiator','AI extracts deal details. The clause library provides the legal wording.',76,626,468,42,{size:'13pt',bold:true,color:C.navy});
 text(s,'mvp-screen-label','CLIENTCLAUSE INTERFACE CONCEPT',570,276,638,22,{size:'10pt',bold:true,color:C.gold});
 await addImage(s,'/var/folders/br/g6_mjbtn6m52kxskdlwwwhc00000gn/T/codex-clipboard-e9feeb12-019c-4992-b27e-2e3fea03073d.png',570,306,638,326,'User-supplied ClientClause landing-page and drafting-workspace design reference','contain');
 text(s,'mvp-screen-note','Product interface direction',570,642,620,24,{size:'11pt',italic:true,color:C.muted});
 note(s,'Product capabilities are documented in the ClientClause README and implemented across backend/main.py, frontend/index.html, and the JSON agreement templates. AI classifies the request and extracts deal data; project-authored clause wording populates drafts; deterministic validation flags missing or invalid items. The screenshot on this slide is the user-supplied design reference from the project conversation, not a fresh capture of a deployed product. The app describes itself as drafting assistance, not legal advice, and recommends professional review for important documents.');
}

// Team
{
 const s=base();
 header(s,'05  Team overview and key roles','Founder-led prototype; specialist validation comes next','The project materials identify one builder. Legal review and customer discovery are the next needs.');
 text(s,'team-name','Garv Agarwala',78,300,525,64,{font:F.serif,size:'31pt',color:C.navy});
 text(s,'team-role','Project author and current builder',82,366,530,34,{size:'17pt',color:C.gold});
 text(s,'team-context','ClientClause is an early product prototype focused on making everyday agreements easier to draft, check, and understand.',82,420,500,100,{size:'16pt',color:C.muted});
 shape(s,'team-rule',640,280,1,320,C.rule);
 text(s,'roles-label','KEY CAPABILITIES NEEDED NEXT',696,300,500,22,{size:'10pt',bold:true,color:C.gold});
 const roles=[
  ['India-qualified legal reviewer','Review clause library, jurisdictional limits, and escalation guidance.'],
  ['Product and engineering','Harden the drafting flow, privacy controls, and reliability.'],
  ['Customer discovery and growth','Test the freelancer wedge and build trusted distribution.'],
 ];
 roles.forEach((it,i)=>{
  const y=344+i*86;
  text(s,`role-title-${i}`,it[0],696,y,480,30,{size:'17pt',bold:true,color:C.navy});
  text(s,`role-copy-${i}`,it[1],696,y+34,492,47,{size:'13pt',color:C.muted});
 });
 line(s,78,618,1125,C.rule,1);
 text(s,'team-foot','NEXT MILESTONE',80,641,150,22,{size:'10pt',bold:true,color:C.gold});
 text(s,'team-foot-copy','Validate the workflow with freelancers and review the clause library with an India-qualified lawyer.',250,634,928,38,{size:'13pt',color:C.ink});
 note(s,'The repository README lists Garv Agarwala under “Author.” No other team members, traction, or legal review partners were identified in the inspected project materials. The roles on the right are proposed capabilities to add or confirm, not current team members.');
}

await fs.mkdir(BUILD,{recursive:true});
await fs.mkdir(OUTDIR,{recursive:true});
const previewDir=path.join(BUILD,'previews');
await fs.mkdir(previewDir,{recursive:true});
for (const [i,slide] of p.slides.items.entries()) {
  const png=await p.export({slide,format:'png',scale:1});
  await fs.writeFile(path.join(previewDir,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
}
const montage=await p.export({format:'webp',montage:true});
await fs.writeFile(path.join(previewDir,'montage.webp'),new Uint8Array(await montage.arrayBuffer()));
const candidate=path.join(BUILD,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
const {finalizePresentation}=await import(pathToFileURL(path.join(SKILL_DIR,'container_tools/artifact_tool_utils.mjs')).href);
const receipt=path.join(BUILD,'validation-polished.json');
const result=await finalizePresentation({
  workspaceDir:ROOT,
  candidatePath:candidate,
  finalPath:FINAL,
  pythonExecutable:'/Users/garv/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
  integrityValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  requiredNativeTableOwnerSlides:[],
  fontPolicy:{basis:'design',families:[F.serif,F.sans]},
  verifyArtifactToolImport:true,
  receiptPath:receipt,
});
console.log(JSON.stringify({result,final:FINAL,previewDir},null,2));
