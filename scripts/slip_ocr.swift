// Local-only OCR. Images never leave the machine.
import Foundation
import Vision
import ImageIO
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
try VNImageRequestHandler(url: url).perform([request])
let rows = (request.results ?? []).compactMap { item -> [String:Any]? in
    guard let text = item.topCandidates(1).first else { return nil }
    return ["text": text.string, "confidence": text.confidence]
}
let data = try JSONSerialization.data(withJSONObject: rows)
FileHandle.standardOutput.write(data)
