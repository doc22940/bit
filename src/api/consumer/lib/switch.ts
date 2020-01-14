import { Consumer, loadConsumer } from '../../../consumer';
import loader from '../../../cli/loader';
import { BEFORE_CHECKOUT } from '../../../cli/loader/loader-messages';
import GeneralError from '../../../error/general-error';
import switchLanes, { SwitchProps } from '../../../consumer/lanes/switch-lanes';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { RemoteLaneId } from '../../../lane-id/lane-id';
import { ApplyVersionResults } from '../../../consumer/versions-ops/merge-version';
import { DEFAULT_LANE } from '../../../constants';

export default async function switchAction(switchProps: SwitchProps): Promise<ApplyVersionResults> {
  loader.start(BEFORE_CHECKOUT);
  const consumer: Consumer = await loadConsumer();
  let results;
  if (switchProps.create) {
    await consumer.createNewLane(switchProps.laneName);
    await consumer.scope.setCurrentLane(switchProps.laneName);
    results = { added: switchProps.laneName };
  } else {
    await resolveLanes(consumer, switchProps);
    results = await switchLanes(consumer, switchProps);
  }

  await consumer.onDestroy();
  return results;
}

async function resolveLanes(consumer: Consumer, switchProps: SwitchProps) {
  const lanes = await consumer.scope.listLanes();
  const { laneName, remoteScope } = switchProps;
  if (remoteScope) {
    // fetch the remote to update all heads
    const localTrackedLane = consumer.scope.getLocalTrackedLaneByRemoteName(laneName, remoteScope);
    switchProps.localLaneName = switchProps.newLaneName || localTrackedLane || laneName;
    if (consumer.getCurrentLaneId().name === switchProps.localLaneName) {
      throw new GeneralError(`already checked out to "${switchProps.localLaneName}"`);
    }
    const scopeComponentImporter = ScopeComponentsImporter.getInstance(consumer.scope);
    const remoteLaneObjects = await scopeComponentImporter.importFromLanes([RemoteLaneId.from(laneName, remoteScope)]);
    const remoteLaneComponents = remoteLaneObjects[0].components;
    const laneExistsLocally = lanes.find(l => l.name === switchProps.localLaneName);
    if (laneExistsLocally) {
      throw new GeneralError(`unable to checkout to a remote lane ${remoteScope}/${laneName}.
the local lane ${switchProps.localLaneName} already exists, please switch to the local lane first by omitting --remote flag
then run "bit merge" to merge the remote lane into the local lane`);
    }
    switchProps.ids = remoteLaneComponents.map(l => l.id.changeVersion(l.head.toString()));
    switchProps.remoteLaneScope = remoteScope;
    switchProps.remoteLaneName = laneName;
    switchProps.remoteLaneComponents = remoteLaneComponents;
    switchProps.localTrackedLane = localTrackedLane || undefined;
    return;
  }
  switchProps.localLaneName = laneName;
  if (consumer.getCurrentLaneId().name === laneName) {
    throw new GeneralError(`already checked out to "${laneName}"`);
  }
  if (laneName === DEFAULT_LANE) {
    switchProps.ids = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
    return;
  }
  const localLane = lanes.find(lane => lane.name === laneName);
  if (!localLane) {
    throw new GeneralError(`unable to find a local lane "${laneName}", to create a new lane please use --create flag`);
  }
  switchProps.ids = localLane.components.map(c => c.id.changeVersion(c.head.toString()));
}
