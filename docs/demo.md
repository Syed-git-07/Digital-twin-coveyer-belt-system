# Five-minute demonstration

## Prepare

Start the application, sign in as an operator, and verify **Simulated telemetry** and **Live**. The bundled trained model is available on the Predictions page. Keep the seed shown in the scenario picker; do not modify physical limits during this demonstration.

## Normal operation

Create **Balanced operation**, start the line and choose **10× speed**. Watch actual parcels enter Infeed, transfer and discharge. Select Transfer to inspect its measurements. Explain the difference between weight load and parcel occupancy. Pause; both positions and simulation time stop while the live connection remains green. Resume.

## Congestion

Open Simulation and set arrivals to **45 parcels/min** and outfeed service to **8 parcels/min**. Apply settings. Wait 60–120 simulated seconds. Observe upstream accumulation, queue growth and possible rejection when the finite buffer fills. Generated = completed + inside + rejected remains true.

Alternatively end the run and create **Slow outfeed** for a fixed reproducible seed/configuration.

## Prediction and intervention

Open Predictions after 30 seconds of history. Show the 60-s bottleneck probability and forecast throughput. Model evaluation is a separate held-out result, not the prediction's probability. Briefly open the confusion matrix and feature importance.

Choose **Evaluate settings**. The worker compares six actual candidate simulations. Apply if a safe improvement exists; otherwise explain that belt speed cannot remove a station service bottleneck. Restore outfeed service to 30/min on Simulation to demonstrate the effect of addressing the physical constraint. An expired recommendation must be regenerated.

## Fault and recovery

Inject **Downstream blockage**, acknowledge its alert and observe that acknowledgment does not remove the blockage. Clear the fault and watch service recover. Inject **Sensor dropout**; transfer sensor readings become missing while tracked parcels continue moving. Clear it; the predictor waits for adequate quality.

Press **E-stop**. Movement/admission stops, temperature continues cooling, and external arrivals are counted as rejected. Clear stop: the line remains stopped. Start explicitly when allowed by thermal recovery.

## Fair comparison and archive

Run an Experiment with **Balanced operation**, **2 minutes**, **3 matched seeds**. The live run keeps its ID and continues independently. Show generated/accepted/rejected workloads, completed parcels, remaining backlog, total energy and completion-change variability. Explain a negative or zero result honestly.

End the live run. Open it in History, play recorded telemetry, download a telemetry CSV and print the report. Refresh the browser: preferences and saved run data remain. Shut down with Ctrl+C when done.
