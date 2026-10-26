import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import TrainerPhoto from "./TrainerPhoto";
const image={type:"image/png",data:btoa("synthetic")};
global.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
const button=label=>[...host.querySelectorAll("button")].find(node=>(node.getAttribute("aria-label")||node.textContent)===label);
beforeEach(()=>{
 host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);
 URL.createObjectURL=jest.fn(()=>"blob:synthetic-"+Math.random());URL.revokeObjectURL=jest.fn();
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());host.remove();});
test("protected thumbnail opens original and keeps food when the photo is explicitly deleted",async()=>{
 const api={photo:jest.fn(async()=>image),deletePhoto:jest.fn(async()=>({deleted:true}))};
 await act(async()=>root.render(<TrainerPhoto api={api} reference="own-reference"/>));
 expect(host.querySelector("img").alt).toBe("Фото 1 з повідомлення");expect(api.photo.mock.calls[0].slice(0,2)).toEqual(["own-reference","thumbnail"]);
 await act(async()=>Simulate.click(button("Відкрити фото 1")));expect(host.querySelector("dialog img").alt).toBe("Повне фото 1 з повідомлення");
 expect(api.photo.mock.calls[1].slice(0,2)).toEqual(["own-reference","original"]);
 await act(async()=>Simulate.click(button("Видалити фото")));expect(api.deletePhoto).not.toHaveBeenCalled();
 expect(host.textContent).toContain("Видалити це фото з історії? Записи про їжу залишаться.");
 await act(async()=>Simulate.click(button("Так, видалити фото")));expect(host.textContent).toContain("Фото видалено або вже недоступне.");
 expect(api.deletePhoto).toHaveBeenCalledTimes(1);expect(URL.revokeObjectURL).toHaveBeenCalled();expect(document.activeElement).toBe(host.querySelector(".trainer-history-photo"));
});
test("Escape closes only the photo and restores focus to its trigger",async()=>{
 const api={photo:jest.fn(async()=>image)},closeChat=jest.fn();await act(async()=>root.render(<div onKeyDown={closeChat}><TrainerPhoto api={api} reference="own-reference"/></div>));
 const trigger=button("Відкрити фото 1");trigger.focus();await act(async()=>Simulate.click(trigger));
 expect(host.querySelector("dialog img")).not.toBeNull();
 await act(async()=>Simulate.keyDown(host.querySelector("dialog"),{key:"Escape"}));expect(host.querySelector("dialog")).toBeNull();expect(document.activeElement).toBe(trigger);expect(closeChat).not.toHaveBeenCalled();
});
test("late image after account lifetime ends cannot create or retain an object URL",async()=>{
 let finish;const api={photo:jest.fn(()=>new Promise(resolve=>{finish=resolve;}))};await act(async()=>root.render(<TrainerPhoto api={api} reference="private-owner"/>));
 expect(api.photo).toHaveBeenCalled();await act(async()=>root.unmount());root=null;
 await act(async()=>{finish(image);await Promise.resolve();});expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test("missing bytes render an explicit state with no broken image",async()=>{
 const api={photo:jest.fn(async()=>{throw Error("media_missing");})};await act(async()=>root.render(<TrainerPhoto api={api} reference="missing"/>));
 expect(host.textContent).toContain("Фото видалено або вже недоступне.");expect(host.querySelector("img")).toBeNull();
});
