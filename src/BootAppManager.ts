// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { BootApp, STATE_INACTIVE } from "./BootApp";

import * as vscode from 'vscode';
import * as uuid from 'uuid';
import * as path from 'path';

interface JavaProjectData {
    path: string;
    name: string;
    classpath: ClassPathData;
}

interface ClassPathData {
    entries: CPE[];
}

interface CPE {
    kind: string;
    path: string; // TODO: Change to File, Path or URL?
    outputFolder: string;
    sourceContainerUrl: string;
    javadocContainerUrl: string;
    isSystem: boolean;
}

function isBootAppClasspath(cp: ClassPathData): boolean {
    if (cp.entries) {
        let entries = cp.entries;
        for (let i = 0; i < entries.length; i++) {
            const cpe = entries[i];
            let filename = path.basename(cpe.path);

            if (filename.endsWith('.jar') && filename.startsWith('spring-boot')) {
                return true;
            }
        }
    }
    return false;
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}


export class BootAppManager {

    private _boot_projects: Map<String, JavaProjectData> = new Map();
    private _onDidChangeApps: vscode.EventEmitter<BootApp | undefined> = new vscode.EventEmitter<BootApp | undefined>();
    constructor() {
        this.initAppListSync();
    }

    public get onDidChangeApps(): vscode.Event<BootApp | undefined> {
        return this._onDidChangeApps.event;
    }
    public fireDidChangeApps(): void {
        this._onDidChangeApps.fire();
    }
    public getAppList(): BootApp[] {
        let apps: BootApp[] = [];
        this._boot_projects.forEach(p => {
            apps.push(new BootApp(p.name, STATE_INACTIVE));
        });
        return apps;
    }

    private initAppListSync(): void {
        //TODO: The code below will fail if jdt language server has not yet been started
        //  How should we deal with that?
        const callbackId = uuid.v4();

        vscode.commands.registerCommand(callbackId, (location: string, name: string, isDeleted: boolean, entries: ClassPathData, ...args: any[]) => {
            if (isDeleted) {
                this._boot_projects.delete(location);
            } else {
                if (isBootAppClasspath(entries)) {
                    this._boot_projects.set(location, {
                        path: location,
                        name: name,
                        classpath: entries
                    });
                } else {
                    this._boot_projects.delete(location);
                }
            }
            this.fireDidChangeApps();
        });
        this._registerClasspathListener(callbackId);
    }

    private async _registerClasspathListener(callbackId: string) {
        const RETRY_TIMES = 20;
        const WAIT_IN_SECOND = 2;
        let tries = 0;
        while (tries < RETRY_TIMES) {
            try {
                await vscode.commands.executeCommand('java.execute.workspaceCommand', 'sts.java.addClasspathListener', callbackId);
                break;
            } catch (error) {
                tries++;
                sleep(WAIT_IN_SECOND * 1000);
            }
        }

        if (tries >= RETRY_TIMES) {
            throw new Error(`Fail to register classpath listener after ${RETRY_TIMES} retries.`);
        }
    }
}