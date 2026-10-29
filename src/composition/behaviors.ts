import { BehaviorRegistry } from '../behavior/registry';
import { idle } from '../behaviors/idle';
import { touch } from '../behaviors/touch';
import { drag } from '../behaviors/drag';
import { drop } from '../behaviors/drop';
import { move } from '../behaviors/move';
import { talk } from '../behaviors/talk';
import { emotions } from '../behaviors/emotion';

export const behaviors = new BehaviorRegistry([idle, touch, drag, drop, move, talk, ...emotions]);
